const STORAGE_KEY = 'friendlyFileNamerV4';

const state = loadState();
const ui = {
  stepContainer: document.getElementById('stepContainer'),
  progressText: document.getElementById('progressText'),
  finalName: document.getElementById('finalName'),
  finalPath: document.getElementById('finalPath'),
  history: document.getElementById('history'),
  downloadBtn: document.getElementById('downloadBtn'),
  inlineError: document.getElementById('inlineError')
};

const answers = {
  file: null,
  type: 'PRT',
  project: state.lastProject || '1251',
  assembly: '001',
  assemblyMode: '3D',
  scope: 'single',
  part: '051',
  thk: '1/4in',
  rev: 1,
  cut: nextCut(state.cutCounter)
};

let currentStep = 0;
const assemblyChoices = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(3, '0'));
const partChoices = Array.from({ length: 25 }, (_, i) => String(51 + i * 2).padStart(3, '0'));
const typeChoices = ['PRT', 'NS', 'ASY', 'PARENT'];
const scopeChoices = ['single', 'multi'];
const assemblyModeChoices = ['2D', '3D'];
const commonThicknessLabels = ['1/8in', '3/16in', '1/4in', '3/8in', '1/2in'];
const allThicknessChoices = buildThicknessChoices();
const previewState = {
  objectUrl: null
};

renderStep();
renderHistory();

function steps() {
  return [
    fileStep(),
    typeStep(),
    projectStep(),
    assemblyStep(),
    assemblyModeStep(),
    nestScopeStep(),
    partStep(),
    thicknessStep(),
    revisionStep(),
    cutStep(),
    reviewStep()
  ].filter(Boolean);
}

function fileStep() {
  const preview = filePreviewMarkup(answers.file);
  return {
    title: 'First, choose your file',
    hint: 'Supports .dxf and .ord files. We keep the extension and rename only the filename body.',
    body: `
      <label for="fileInput">Upload file<input id="fileInput" type="file" accept=".dxf,.ord" required /></label>
      <p class="tiny">${answers.file ? `${answers.file.name} (${formatBytes(answers.file.size)})` : 'No file selected yet.'}</p>
      ${preview ? `<div class="file-preview-wrap">${preview}</div>` : ''}
    `,
    setup: () => {
      const input = byId('fileInput');
      input.onchange = async () => {
        releasePreviewObjectUrl();
        const selected = input.files?.[0] || null;
        if (selected && !isSupportedUpload(selected.name)) {
          answers.file = null;
          input.value = '';
          ui.inlineError.textContent = 'Only .dxf and .ord files are supported.';
          renderStep();
          return;
        }

        answers.file = selected;
        if (answers.file) {
          await preparePreviewData(answers.file);
        }
        renderStep();
      };
    },
    valid: () => Boolean(answers.file),
    error: 'Please choose a file to continue.'
  };
}

function typeStep() {
  return {
    title: 'What is this for?',
    hint: 'One click. Type decides which next questions appear.',
    body: choiceButtons('type', typeChoices, answers.type, {
      PRT: 'Part',
      NS: 'Nest',
      ASY: 'Assembly',
      PARENT: 'Parent'
    }),
    setup: () => setupChoiceButtons('type', value => {
      answers.type = value;
      if (answers.type !== 'NS') answers.scope = 'single';
      if (answers.type !== 'ASY') answers.assemblyMode = '3D';
    }, { autoNext: true }),
    valid: () => typeChoices.includes(answers.type),
    error: 'Please select a valid type.',
    autoAdvance: true
  };
}

function projectStep() {
  return {
    title: 'What project is this for?',
    hint: 'Project number is exactly 4 digits.',
    body: `<label for="project">Project #<input id="project" value="${answers.project}" maxlength="4" inputmode="numeric" placeholder="1251" /></label>`,
    setup: () => {
      const el = byId('project');
      el.oninput = () => {
        answers.project = el.value.replace(/\D/g, '').slice(0, 4);
        el.value = answers.project;
      };
    },
    valid: () => /^\d{4}$/.test(answers.project),
    error: 'Project must be exactly 4 digits.'
  };
}

function assemblyStep() {
  return {
    title: 'Pick an assembly number',
    hint: 'Dropdown kept for quick list scanning.',
    body: `<label for="assembly">Assembly<select id="assembly">${assemblyChoices.map(a => `<option value="${a}">${a}</option>`).join('')}</select></label>`,
    setup: () => {
      const el = byId('assembly');
      el.value = answers.assembly;
      el.onchange = () => (answers.assembly = el.value);
    },
    valid: () => assemblyChoices.includes(answers.assembly),
    error: 'Please choose an assembly number.'
  };
}

function assemblyModeStep() {
  if (answers.type !== 'ASY') return null;
  return {
    title: 'Assembly type',
    hint: '2D assemblies require thickness. 3D assemblies skip thickness.',
    body: choiceButtons('assemblyMode', assemblyModeChoices, answers.assemblyMode),
    setup: () => setupChoiceButtons('assemblyMode', value => (answers.assemblyMode = value), { autoNext: true }),
    valid: () => assemblyModeChoices.includes(answers.assemblyMode),
    error: 'Choose 2D or 3D assembly.',
    autoAdvance: true
  };
}

function nestScopeStep() {
  if (answers.type !== 'NS') return null;
  return {
    title: 'Nest scope',
    hint: 'Single-part includes part token. Multi-part skips part token.',
    body: choiceButtons('scope', scopeChoices, answers.scope, {
      single: 'Single part',
      multi: 'Multi-part'
    }),
    setup: () => setupChoiceButtons('scope', value => (answers.scope = value), { autoNext: true }),
    valid: () => scopeChoices.includes(answers.scope),
    error: 'Pick single-part or multi-part.',
    autoAdvance: true
  };
}

function partStep() {
  const needed = answers.type === 'PRT' || (answers.type === 'NS' && answers.scope === 'single');
  if (!needed) return null;

  return {
    title: 'Pick a part number',
    hint: 'Dropdown kept here by request.',
    body: `<label for="part">Part<select id="part">${partChoices.map(p => `<option value="${p}">${p}</option>`).join('')}</select></label>`,
    setup: () => {
      const el = byId('part');
      el.value = answers.part;
      el.onchange = () => (answers.part = el.value);
    },
    valid: () => partChoices.includes(answers.part),
    error: 'Please choose a part number.'
  };
}

function thicknessStep() {
  const needed = answers.type === 'PRT' || answers.type === 'NS' || (answers.type === 'ASY' && answers.assemblyMode === '2D');
  if (!needed) return null;

  return {
    title: 'Choose thickness',
    hint: 'Quick picks on top. Full list from gauge sheet to 2in below.',
    body: `
      <p class="tiny">Most common:</p>
      ${choiceButtons('thkCommon', commonThicknessLabels, answers.thk)}
      <label for="thkAny">Any thickness (full list)
        <select id="thkAny">${allThicknessChoices.map(t => `<option value="${t}" ${t === answers.thk ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </label>
    `,
    setup: () => {
      setupChoiceButtons('thkCommon', label => {
        answers.thk = label;
      }, { autoNext: true });

      const any = byId('thkAny');
      any.onchange = () => {
        answers.thk = normalizeThickness(any.value);
      };
    },
    valid: () => allThicknessChoices.includes(answers.thk),
    error: 'Choose a valid thickness from the list.'
  };
}

function revisionStep() {
  return {
    title: 'Revision number',
    hint: 'Positive whole number only (we add P automatically).',
    body: `<label for="rev">Revision<input id="rev" type="number" min="1" step="1" value="${answers.rev}" /></label>`,
    setup: () => {
      const el = byId('rev');
      el.oninput = () => {
        answers.rev = Number.parseInt(el.value, 10);
      };
    },
    valid: () => Number.isInteger(answers.rev) && answers.rev > 0,
    error: 'Revision must be a whole number greater than 0.'
  };
}

function cutStep() {
  if (answers.type !== 'NS') return null;

  const suggested = nextCut(state.cutCounter);
  const quickCuts = Array.from(new Set([
    suggested,
    nextCut(state.cutCounter + 1),
    nextCut(Math.max(1, state.cutCounter - 1))
  ]));

  return {
    title: 'Cut number',
    hint: 'Use the number field or tap a quick option. We format as C### for you.',
    body: `
      <label for="cutNum">Cut number
        <input id="cutNum" type="number" min="1" max="999" step="1" value="${cutToNumber(answers.cut)}" />
      </label>
      <p class="tiny">Cut token: <strong id="cutPreview">${answers.cut}</strong></p>
      <p class="tiny">Quick picks:</p>
      ${choiceButtons('cutQuick', quickCuts, answers.cut)}
      <button id="useSuggested" type="button" class="secondary">Use suggested ${suggested}</button>
    `,
    setup: () => {
      const input = byId('cutNum');
      const preview = byId('cutPreview');
      const applyNumber = () => {
        const n = Math.min(999, Math.max(1, Number.parseInt(input.value || '1', 10) || 1));
        answers.cut = nextCut(n);
        input.value = String(n);
        preview.textContent = answers.cut;
      };

      input.oninput = applyNumber;
      input.onblur = applyNumber;

      setupChoiceButtons('cutQuick', value => {
        answers.cut = value;
        input.value = String(cutToNumber(value));
        preview.textContent = value;
      });

      byId('useSuggested').onclick = () => {
        answers.cut = suggested;
        input.value = String(cutToNumber(suggested));
        preview.textContent = suggested;
      };
    },
    valid: () => /^C\d{3}$/.test(answers.cut),
    error: 'Cut must be C### (example C007).'
  };
}

function reviewStep() {
  const generated = buildFilename();
  const savePath = buildPath();
  const hasFile = Boolean(answers.file);

  return {
    title: 'Looks great ✨',
    hint: randomNote(),
    body: hasFile
      ? `<p><strong>${generated}</strong></p><p class="tiny">${savePath}${generated}</p>`
      : '<p class="tiny">Missing file upload. Go back to step 1.</p>',
    setup: () => {
      ui.finalName.textContent = hasFile ? generated : '—';
      ui.finalPath.textContent = hasFile ? `${savePath}${generated}` : '—';
      ui.downloadBtn.classList.toggle('hidden', !hasFile);
      ui.downloadBtn.disabled = !hasFile;
      ui.downloadBtn.onclick = () => hasFile && downloadRenamed(answers.file, generated);
      if (hasFile) persistRecord(generated, savePath);
    },
    valid: () => hasFile,
    error: 'A file must be uploaded before saving.',
    hideNext: true
  };
}

function renderStep() {
  const flow = steps();
  currentStep = Math.max(0, Math.min(currentStep, flow.length - 1));
  const step = flow[currentStep];

  ui.progressText.textContent = `Step ${currentStep + 1} of ${flow.length}`;
  ui.inlineError.textContent = '';

  const autoAdvanceStep = step.autoAdvance && !step.hideNext;
  const nextButton = `<button id="nextBtn" type="button" class="${autoAdvanceStep ? 'ghost' : ''}" ${autoAdvanceStep ? 'disabled aria-hidden="true" tabindex="-1"' : ''}>${step.hideNext ? 'Start another file' : 'Next'}</button>`;

  const shell = document.createElement('div');
  shell.className = 'step';
  shell.innerHTML = `
    <h2>${step.title}</h2>
    <p class="tiny">${step.hint}</p>
    ${step.body}
    <div class="row">
      <button id="backBtn" type="button" class="secondary" ${currentStep === 0 ? 'disabled' : ''}>Back</button>
      ${nextButton}
    </div>
  `;

  ui.stepContainer.innerHTML = '';
  ui.stepContainer.appendChild(shell);
  step.setup?.();
  wireEnterToNext();

  byId('backBtn').onclick = () => {
    if (currentStep === 0) return;
    currentStep -= 1;
    renderStep();
  };

  const nextBtn = byId('nextBtn');
  if (nextBtn) nextBtn.onclick = () => {
    if (step.hideNext) {
      resetForNewFile();
      return;
    }

    if (!step.valid()) {
      ui.inlineError.textContent = step.error || 'Please fix this answer before continuing.';
      return;
    }

    currentStep += 1;
    renderStep();
  };
}

function goToNextStep() {
  currentStep += 1;
  renderStep();
}

function choiceButtons(name, options, selected, labels = {}) {
  return `
    <div class="choice-group" role="radiogroup" aria-label="${name}">
      ${options
        .map(
          option => `<button type="button" class="choice ${selected === option ? 'active' : ''}" data-choice="${name}" data-value="${option}" aria-pressed="${selected === option}">${labels[option] || option}</button>`
        )
        .join('')}
    </div>
  `;
}

function setupChoiceButtons(name, onPick, options = {}) {
  ui.stepContainer.querySelectorAll(`[data-choice="${name}"]`).forEach(button => {
    button.addEventListener('click', () => {
      onPick(button.dataset.value);
      ui.stepContainer
        .querySelectorAll(`[data-choice="${name}"]`)
        .forEach(btn => {
          const active = btn === button;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', String(active));
        });

      if (options.autoNext) {
        goToNextStep();
      }
    });
  });
}

function buildFilename() {
  if (!answers.file) return '';

  const ext = extractExtension(answers.file.name);
  const list = [answers.type, answers.project, answers.assembly];
  const includePart = answers.type === 'PRT' || (answers.type === 'NS' && answers.scope === 'single');
  const includeThk = answers.type === 'PRT' || answers.type === 'NS' || (answers.type === 'ASY' && answers.assemblyMode === '2D');

  if (includePart) list.push(answers.part);
  if (includeThk) list.push(thicknessForFilename(answers.thk));
  list.push(`P${answers.rev}`);
  if (answers.type === 'NS') list.push(answers.cut);

  return `${list.join('-')}${ext}`;
}

function buildPath() {
  const base = `${state.oneDriveRoot}/Projects/${answers.project}/ASY-${answers.assembly}/`;
  if (answers.type === 'PRT') return `${base}Parts/`;
  if (answers.type === 'NS') return `${base}Nests/`;
  if (answers.type === 'PARENT') return `${base}Parent/`;
  return `${base}CAD/`;
}

function persistRecord(generated, savePath) {
  const fullPath = `${savePath}${generated}`;
  const dedupeKey = `${generated}|${fullPath}`;
  if (state.lastSaved === dedupeKey) return;

  state.lastSaved = dedupeKey;
  state.lastProject = answers.project;
  if (answers.type === 'NS') {
    state.cutCounter = Math.max(state.cutCounter, Number(answers.cut.slice(1)) + 1);
  }

  state.history = [
    { name: generated, path: fullPath, at: new Date().toISOString() },
    ...state.history.filter(item => `${item.name}|${item.path}` !== dedupeKey)
  ].slice(0, 20);

  saveState();
  renderHistory();
}

function resetForNewFile() {
  releasePreviewObjectUrl();
  answers.file = null;
  answers.assemblyMode = '3D';
  answers.scope = 'single';
  answers.rev = 1;
  answers.cut = nextCut(state.cutCounter);
  state.lastSaved = null;

  currentStep = 0;
  ui.finalName.textContent = '—';
  ui.finalPath.textContent = '—';
  ui.downloadBtn.classList.add('hidden');
  ui.downloadBtn.disabled = true;
  ui.inlineError.textContent = '';
  renderStep();
}

function renderHistory() {
  if (!state.history.length) {
    ui.history.innerHTML = '<li class="tiny">No files renamed yet.</li>';
    return;
  }

  ui.history.innerHTML = state.history
    .map(item => `<li><strong>${item.name}</strong><br/><span class="tiny">${item.path}</span></li>`)
    .join('');
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      oneDriveRoot: saved.oneDriveRoot || 'OneDriveRoot',
      history: Array.isArray(saved.history) ? saved.history : [],
      cutCounter: Number.isInteger(saved.cutCounter) && saved.cutCounter > 0 ? saved.cutCounter : 1,
      lastProject: /^\d{4}$/.test(saved.lastProject) ? saved.lastProject : '1251',
      lastSaved: null
    };
  } catch {
    return { oneDriveRoot: 'OneDriveRoot', history: [], cutCounter: 1, lastProject: '1251', lastSaved: null };
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      oneDriveRoot: state.oneDriveRoot,
      history: state.history,
      cutCounter: state.cutCounter,
      lastProject: state.lastProject
    })
  );
}

function nextCut(n) {
  return `C${String(n).padStart(3, '0')}`;
}

function cutToNumber(cut) {
  const n = Number.parseInt(String(cut || '').replace(/^C/i, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function normalizeCut(value) {
  const cleaned = String(value || '').toUpperCase().replace(/\s/g, '').replace(/[^C\d]/g, '');
  const digits = cleaned.replace(/^C/, '').replace(/\D/g, '').slice(0, 3);
  return `C${digits.padStart(3, '0')}`;
}

function buildThicknessChoices() {
  const list = ['Gauge Sheet'];
  for (let i = 1; i <= 32; i += 1) {
    list.push(formatSixteenth(i));
  }
  return Array.from(new Set(list));
}

function formatSixteenth(i) {
  const whole = Math.floor(i / 16);
  const remainder = i % 16;
  if (remainder === 0) return `${whole}in`;
  const g = gcd(remainder, 16);
  const num = remainder / g;
  const den = 16 / g;
  if (whole === 0) return `${num}/${den}in`;
  return `${whole}-${num}/${den}in`;
}

function normalizeThickness(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/gauge/i.test(raw)) return 'Gauge Sheet';

  const label = raw.replace(/\s+/g, '');
  const direct = allThicknessChoices.find(option => option.toLowerCase() == label.toLowerCase());
  return direct || value;
}

function thicknessForFilename(value) {
  if (/gauge/i.test(String(value || ''))) return 'GaugeSheet';

  const inches = parseThicknessToInches(value);
  if (inches == null) return value;

  return `${formatExactDecimal(inches)}in`;
}

function parseThicknessToInches(raw) {
  const text = String(raw || '').toLowerCase().replace(/in|"/g, '').trim();
  if (!text) return null;

  if (/^\d*\.?\d+$/.test(text)) return Number(text);

  if (/^\d+-\d+\/\d+$/.test(text)) {
    const [whole, frac] = text.split('-');
    const [num, den] = frac.split('/').map(Number);
    if (!den) return null;
    return Number(whole) + (num / den);
  }

  if (/^\d+\/\d+$/.test(text)) {
    const [num, den] = text.split('/').map(Number);
    if (!den) return null;
    return num / den;
  }

  return null;
}

function formatExactDecimal(inches) {
  if (!Number.isFinite(inches)) return '';
  let text = inches.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const dot = text.indexOf('.');
  if (dot === -1) {
    return `${text}.00`;
  }
  const decimals = text.length - dot - 1;
  if (decimals === 1) return `${text}0`;
  return text;
}

function gcd(a, b) {
  if (!b) return a;
  return gcd(b, a % b);
}


function isSupportedUpload(filename) {
  const ext = extractExtension(filename).toLowerCase();
  return ext === '.dxf' || ext === '.ord';
}

function extractExtension(filename) {
  const name = String(filename || '');
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) return '';
  return name.slice(lastDot);
}

function filePreviewMarkup(file) {
  if (!file || !file.preview) return '';

  const { mode, content } = file.preview;
  if (mode === 'svg') {
    return `<p class="tiny preview-title">Quick preview</p><div class="file-preview-pop"><img src="${content}" alt="2D preview of ${file.name}" /></div>`;
  }

  if (mode === 'message') {
    return `<p class="tiny preview-title">Quick preview</p><div class="file-preview-pop"><p class="tiny preview-message">${escapeHtml(content)}</p></div>`;
  }

  return '';
}

async function preparePreviewData(file) {
  const ext = extractExtension(file.name).toLowerCase();

  if (ext === '.svg' || file.type === 'image/svg+xml') {
    previewState.objectUrl = URL.createObjectURL(file);
    file.preview = { mode: 'svg', content: previewState.objectUrl };
    return;
  }

  if (file.type.startsWith('image/')) {
    previewState.objectUrl = URL.createObjectURL(file);
    file.preview = { mode: 'svg', content: previewState.objectUrl };
    return;
  }

  const buffer = await file.arrayBuffer();
  const content = decodeBufferText(buffer);
  if (looksLikeSvg(content)) {
    file.preview = { mode: 'svg', content: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}` };
    return;
  }

  const previewSvg = renderCadToSvgDataUrl(content)
    || renderOmaxToolpathToSvgDataUrl(content, ext)
    || renderCoordinateCloudToSvgDataUrl(content);

  file.preview = previewSvg
    ? { mode: 'svg', content: previewSvg }
    : { mode: 'message', content: '2D preview unavailable for this file.' };
}

function looksLikeSvg(text) {
  const normalized = String(text || '').trimStart().toLowerCase();
  return normalized.startsWith('<svg') || (normalized.startsWith('<?xml') && normalized.includes('<svg'));
}

function decodeBufferText(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const cleanedUtf8 = utf8.replaceAll('\u0000', '');
  if (cleanedUtf8.trim()) return cleanedUtf8;

  const latin1 = new TextDecoder('iso-8859-1', { fatal: false }).decode(buffer);
  return latin1.replaceAll('\u0000', '');
}

function renderCadToSvgDataUrl(text) {
  const segments = parseCadSegments(text);
  if (!segments.length) return '';

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

  const paths = segments
    .map(item => `<line x1="${item.x1}" y1="${-item.y1}" x2="${item.x2}" y2="${-item.y2}"/>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${-(vbY + vbH)} ${vbW} ${vbH}"><rect x="${vbX}" y="${-(vbY + vbH)}" width="${vbW}" height="${vbH}" fill="#ffffff"/><g stroke="#32407a" stroke-width="${Math.max(vbW, vbH) / 450}" fill="none" stroke-linecap="round">${paths}</g></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}


function renderOmaxToolpathToSvgDataUrl(content, ext) {
  if (ext !== '.ord') return '';

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

  if (path.length < 2) return '';
  const focusPoints = pointsDrawn.length >= 2 ? pointsDrawn : pointsSeen;
  const bounds = normalizePreviewBounds(focusPoints, boundsFromPoints(focusPoints));
  return buildPathSvgDataUrl(path, bounds);
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

function renderCoordinateCloudToSvgDataUrl(text) {
  const lines = String(text || '').split(/\r?\n/).slice(0, 6000);
  if (!lines.length) return '';

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

  if (path.length < 2) return '';
  const focusPoints = pointsDrawn.length >= 2 ? pointsDrawn : pointsSeen;
  const bounds = normalizePreviewBounds(focusPoints, boundsFromPoints(focusPoints));
  return buildPathSvgDataUrl(path, bounds);
}

function inferRelativeMode(lines) {
  const sample = lines.slice(0, 150).join('\n').toUpperCase();
  if (/(?:\bG90\b|\bABS(?:OLUTE)?\b)/.test(sample)) return false;
  if (/(?:\bG91\b|\bREL(?:ATIVE)?\b|\bINCR(?:EMENTAL)?\b|\bDELTA\b|\bOFFSET\b)/.test(sample)) return true;

  const points = lines
    .slice(0, 250)
    .flatMap(extractLinePoints)
    .slice(0, 300);

  if (points.length < 8) return false;

  const maxAbs = points.reduce((acc, p) => Math.max(acc, Math.abs(p.x), Math.abs(p.y)), 0);
  const avgDelta = points.slice(1).reduce((acc, p, i) => {
    const prev = points[i];
    return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0) / Math.max(1, points.length - 1);

  return maxAbs > 0 && avgDelta > 0 && avgDelta < (maxAbs * 0.45);
}

function chooseBestNumericPairMode(lines) {
  const modes = ['labelled', 'first', 'second', 'last'];
  const scored = modes
    .map(mode => ({ mode, score: scorePairMode(lines, mode) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.mode || 'last';
}

function scorePairMode(lines, mode) {
  const points = lines
    .slice(0, 500)
    .flatMap(line => parseLinePointsByMode(line, mode))
    .slice(0, 800);

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

  const text = String(line || '');
  const safeNumericLine = /^[\s,;:+\-\d.eE]+$/.test(text);
  if (!safeNumericLine) return [];

  const numbers = [...text.matchAll(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)]
    .map(match => Number.parseFloat(match[0]))
    .filter(Number.isFinite);

  if (numbers.length < 2) return [];

  if (mode === 'first') return [{ x: numbers[0], y: numbers[1] }];
  if (mode === 'second' && numbers.length >= 3) return [{ x: numbers[1], y: numbers[2] }];
  return [{ x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] }];
}

function extractLinePoints(line) {
  const text = String(line || '');
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

function buildPathSvgDataUrl(path, bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const pad = Math.max(width, height) * 0.08;
  const vbX = bounds.minX - pad;
  const vbY = bounds.minY - pad;
  const vbW = width + (pad * 2);
  const vbH = height + (pad * 2);

  const d = path.join(' ');
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

  if (!Number.isFinite(fallbackBounds.minX) || !Number.isFinite(fallbackBounds.maxX) || !Number.isFinite(fallbackBounds.minY) || !Number.isFinite(fallbackBounds.maxY)) return trimmed;

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


function bestBinaryPointStream(buffer) {
  const view = new DataView(buffer);
  const candidates = [];

  for (let offset = 0; offset < 8; offset += 1) {
    [true, false].forEach(littleEndian => {
      const points = [];
      for (let i = offset; i + 8 <= view.byteLength && points.length < 5000; i += 8) {
        const x = view.getFloat32(i, littleEndian);
        const y = view.getFloat32(i + 4, littleEndian);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (Math.abs(x) > 100000 || Math.abs(y) > 100000) continue;
        points.push({ x, y });
      }

      const score = scoreBinaryStream(points);
      if (score > 0) candidates.push({ points, score });
    });
  }

  if (!candidates.length) return [];
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].points;
}

function scoreBinaryStream(points) {
  if (points.length < 3) return 0;

  let connected = 0;
  let tiny = 0;
  for (let i = 1; i < points.length; i += 1) {
    const jump = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (jump > 0 && jump < 20000) connected += 1;
    if (jump > 0 && jump < 0.0001) tiny += 1;
  }

  const bounds = boundsFromPoints(points);
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)) return 0;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);

  const tinyPenalty = tiny / Math.max(1, points.length - 1);
  return (connected / Math.max(1, points.length - 1)) * 100 - (tinyPenalty * 20) + Math.log10(span + 1);
}

function renderBinaryFloatPairsToSvgDataUrl(buffer) {
  const points = bestBinaryPointStream(buffer);
  if (points.length < 3) return '';

  const path = [];
  const pointsDrawn = [];
  let prev = null;

  points.forEach(next => {
    if (!prev) {
      path.push(`M ${next.x} ${-next.y}`);
      prev = next;
      return;
    }

    const jump = Math.hypot(next.x - prev.x, next.y - prev.y);
    if (jump === 0) return;
    if (jump > 20000) {
      path.push(`M ${next.x} ${-next.y}`);
    } else {
      path.push(`L ${next.x} ${-next.y}`);
      pointsDrawn.push(prev, next);
    }
    prev = next;
  });

  if (path.length < 3) return '';
  const focusPoints = pointsDrawn.length >= 2 ? pointsDrawn : points;
  const bounds = normalizePreviewBounds(focusPoints, boundsFromPoints(focusPoints));
  return buildPathSvgDataUrl(path, bounds);
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

  if (!path.length) return '';
  return buildPathSvgDataUrl(path, bounds);
}

function parseCadSegments(text) {
  const lines = String(text || '').split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number.parseInt(String(lines[i] || '').trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: String(lines[i + 1] || '').trim() });
  }

  const entities = [];
  let section = '';
  let current = null;

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair.code !== 0) {
      if (current) current.data.push(pair);
      continue;
    }

    const marker = pair.value.toUpperCase();
    if (marker === 'SECTION') {
      const namePair = pairs[i + 1];
      if (namePair?.code === 2) {
        section = namePair.value.toUpperCase();
        i += 1;
      }
      continue;
    }

    if (marker === 'ENDSEC') {
      section = '';
      current = null;
      continue;
    }

    if (section !== 'ENTITIES') continue;

    if (current) entities.push(current);
    current = { type: marker, data: [] };
  }
  if (current) entities.push(current);

  const segments = [];
  let polyline = null;

  entities.forEach(entity => {
    if (entity.type === 'LINE') {
      const x1 = numberCode(entity.data, 10);
      const y1 = numberCode(entity.data, 20);
      const x2 = numberCode(entity.data, 11);
      const y2 = numberCode(entity.data, 21);
      if ([x1, y1, x2, y2].every(Number.isFinite)) segments.push({ x1, y1, x2, y2 });
      return;
    }

    if (entity.type === 'CIRCLE') {
      const cx = numberCode(entity.data, 10);
      const cy = numberCode(entity.data, 20);
      const r = numberCode(entity.data, 40);
      if ([cx, cy, r].every(Number.isFinite) && r > 0) {
        segments.push(...arcToSegments(cx, cy, r, 0, 360));
      }
      return;
    }

    if (entity.type === 'ARC') {
      const cx = numberCode(entity.data, 10);
      const cy = numberCode(entity.data, 20);
      const r = numberCode(entity.data, 40);
      const start = numberCode(entity.data, 50);
      const end = numberCode(entity.data, 51);
      if ([cx, cy, r, start, end].every(Number.isFinite) && r > 0) {
        segments.push(...arcToSegments(cx, cy, r, start, end));
      }
      return;
    }

    if (entity.type === 'LWPOLYLINE') {
      const points = extractPoints(entity.data);
      const closed = (intCode(entity.data, 70) & 1) === 1;
      segments.push(...pointsToSegments(points, closed));
      return;
    }

    if (entity.type === 'POLYLINE') {
      polyline = { points: [], closed: (intCode(entity.data, 70) & 1) === 1 };
      return;
    }

    if (entity.type === 'VERTEX' && polyline) {
      const x = numberCode(entity.data, 10);
      const y = numberCode(entity.data, 20);
      if ([x, y].every(Number.isFinite)) polyline.points.push({ x, y });
      return;
    }

    if (entity.type === 'SEQEND' && polyline) {
      segments.push(...pointsToSegments(polyline.points, polyline.closed));
      polyline = null;
    }
  });

  return segments;
}

function arcToSegments(cx, cy, radius, startDeg, endDeg) {
  let start = startDeg;
  let end = endDeg;
  while (end < start) end += 360;
  const sweep = Math.max(1, end - start);
  const steps = Math.max(8, Math.ceil(sweep / 10));
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = (start + ((sweep * i) / steps)) * (Math.PI / 180);
    points.push({ x: cx + (radius * Math.cos(angle)), y: cy + (radius * Math.sin(angle)) });
  }

  return pointsToSegments(points, false);
}

function extractPoints(data) {
  const points = [];
  let currentX = null;

  data.forEach(pair => {
    if (pair.code === 10) {
      currentX = Number.parseFloat(pair.value);
      return;
    }

    if (pair.code === 20 && Number.isFinite(currentX)) {
      const y = Number.parseFloat(pair.value);
      if (Number.isFinite(y)) points.push({ x: currentX, y });
      currentX = null;
    }
  });

  return points;
}

function pointsToSegments(points, closed) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    out.push({ x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y });
  }

  if (closed && points.length > 2) {
    out.push({ x1: points[points.length - 1].x, y1: points[points.length - 1].y, x2: points[0].x, y2: points[0].y });
  }

  return out;
}

function numberCode(data, code) {
  const found = data.find(item => item.code === code);
  const n = Number.parseFloat(found?.value || '');
  return Number.isFinite(n) ? n : NaN;
}

function intCode(data, code) {
  const found = data.find(item => item.code === code);
  const n = Number.parseInt(found?.value || '', 10);
  return Number.isFinite(n) ? n : 0;
}

function releasePreviewObjectUrl() {
  if (!previewState.objectUrl) return;
  URL.revokeObjectURL(previewState.objectUrl);
  previewState.objectUrl = null;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function wireEnterToNext() {
  const next = byId('nextBtn');
  if (!next) return;
  const controls = ui.stepContainer.querySelectorAll('input, select');
  controls.forEach(control => {
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        next?.click();
      }
    });
  });
}

function randomNote() {
  const notes = [
    'Nice click-flow. Want to tweak anything before download?',
    'Quick and clean ✨ You can still go back and adjust.',
    'All tokens look valid. Save when ready.'
  ];
  return notes[Math.floor(Math.random() * notes.length)];
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function byId(id) {
  return document.getElementById(id);
}

function downloadRenamed(file, filename) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
