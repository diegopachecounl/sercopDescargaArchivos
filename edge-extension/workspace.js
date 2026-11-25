import {
  buildFinalFilename,
  fetchAndParseSercopProcess,
  inferExtensionFromResponse,
  inspectActiveTabUrl,
  sanitizeFilenameBase,
  validateSercopUrl,
} from './sercop-parser.js';

const errorView = document.getElementById('error-view');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorUrlBox = document.getElementById('error-url-box');
const loadingView = document.getElementById('loading-view');
const loadingSub = document.getElementById('loading-sub');
const workspaceView = document.getElementById('workspace-view');

const processCodeEl = document.getElementById('process-code');
const entityNameEl = document.getElementById('entity-name');
const linkTab6El = document.getElementById('link-tab6');
const linkProcessEl = document.getElementById('link-process');
const btnRefresh = document.getElementById('btn-refresh');

const tabArchivos = document.getElementById('tab-archivos');
const tabInfo = document.getElementById('tab-info');
const panelArchivos = document.getElementById('panel-archivos');
const panelInfo = document.getElementById('panel-info');
const filesCountLabel = document.getElementById('files-count-label');

const btnChooseFolder = document.getElementById('btn-choose-folder');
const btnSaveFolder = document.getElementById('btn-save-folder');
const selectedCountEl = document.getElementById('selected-count');
const chkProcessSubfolder = document.getElementById('chk-process-subfolder');
const chkGroupPhase = document.getElementById('chk-group-phase');
const destPreviewEl = document.getElementById('dest-preview');
const statusBannerEl = document.getElementById('status-banner');
const probeBadgeEl = document.getElementById('probe-badge');

const searchInput = document.getElementById('search-input');
const phaseSelect = document.getElementById('phase-select');
const extSegmented = document.getElementById('ext-segmented');
const chkSelectAll = document.getElementById('chk-select-all');
const filesTbody = document.getElementById('files-tbody');
const footerSummaryEl = document.getElementById('footer-summary');
const infoListEl = document.getElementById('info-list');

let processData = null;
let dirHandle = null;
let selectedIds = new Set();
let fileStatuses = new Map();
let searchQuery = '';
let phaseFilter = 'all';
let extFilter = 'all';
let isSaving = false;

function showError(title, message, activeUrl) {
  loadingView.classList.add('hidden');
  workspaceView.classList.add('hidden');
  errorView.classList.remove('hidden');
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  if (activeUrl) {
    errorUrlBox.textContent = activeUrl;
    errorUrlBox.classList.remove('hidden');
  } else {
    errorUrlBox.classList.add('hidden');
  }
}

function getExtCategory(ext) {
  const clean = (ext || '').toLowerCase().replace(/^\./, '');
  if (clean === 'pdf') return 'pdf';
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(clean)) return 'excel';
  if (['doc', 'docx', 'rtf', 'odt', 'txt'].includes(clean)) return 'word';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(clean)) return 'archive';
  return 'other';
}

function getFilteredFiles() {
  if (!processData) return [];
  const q = searchQuery.trim().toLowerCase();
  return processData.files.filter((file) => {
    if (phaseFilter !== 'all' && file.phase !== phaseFilter) return false;
    if (extFilter !== 'all' && getExtCategory(file.extension) !== extFilter) return false;
    if (!q) return true;
    return (
      file.tableName.toLowerCase().includes(q) ||
      file.suggestedFilename.toLowerCase().includes(q) ||
      file.phase.toLowerCase().includes(q) ||
      file.extension.toLowerCase().includes(q) ||
      (file.uploadedByEntity || '').toLowerCase().includes(q) ||
      (file.uploadedByUser || '').toLowerCase().includes(q)
    );
  });
}

function updateDestinationPreview() {
  if (!dirHandle) {
    destPreviewEl.textContent = 'Haz clic en "Elegir carpeta local..." para seleccionar la carpeta destino';
    return;
  }
  const parts = [dirHandle.name];
  if (chkProcessSubfolder.checked && processData) {
    parts.push(sanitizeFilenameBase(processData.processCode));
  }
  if (chkGroupPhase.checked) {
    parts.push('<Fase>');
  }
  destPreviewEl.textContent = `Destino: ${parts.join('/')}/`;
}

function renderSelectionCounts() {
  selectedCountEl.textContent = String(selectedIds.size);
  btnSaveFolder.disabled = isSaving || selectedIds.size === 0;
}

function renderTable() {
  if (!processData) return;
  const filtered = getFilteredFiles();
  filesTbody.textContent = '';
  chkSelectAll.checked =
    filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id));

  for (const file of filtered) {
    const tr = document.createElement('tr');
    const isSelected = selectedIds.has(file.id);
    if (isSelected) tr.classList.add('selected');

    const tdChk = document.createElement('td');
    tdChk.className = 'col-check';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = isSelected;
    chk.addEventListener('change', () => {
      if (chk.checked) selectedIds.add(file.id);
      else selectedIds.delete(file.id);
      renderSelectionCounts();
      renderTable();
    });
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    const tdNum = document.createElement('td');
    tdNum.className = 'col-num mono';
    tdNum.textContent = String(file.index);
    tr.appendChild(tdNum);

    const tdName = document.createElement('td');
    const titleDiv = document.createElement('div');
    titleDiv.className = 'file-title';
    titleDiv.textContent = file.tableName;
    const subDiv = document.createElement('div');
    subDiv.className = 'file-sub';
    const st = fileStatuses.get(file.id);
    const displayFinal = st?.resolvedName || file.suggestedFilename;
    subDiv.textContent = file.size ? `${displayFinal} · ${file.size}` : displayFinal;
    tdName.appendChild(titleDiv);
    tdName.appendChild(subDiv);
    tr.appendChild(tdName);

    const tdPhase = document.createElement('td');
    tdPhase.className = 'phase-cell';
    tdPhase.textContent = file.phase;
    tr.appendChild(tdPhase);

    const tdMeta = document.createElement('td');
    if (file.uploadedByEntity) {
      const entDiv = document.createElement('div');
      entDiv.className = 'meta-entity';
      entDiv.title = file.uploadedByEntity;
      entDiv.textContent = file.uploadedByEntity;
      tdMeta.appendChild(entDiv);
    }
    const dateDiv = document.createElement('div');
    dateDiv.className = 'meta-date';
    dateDiv.textContent = file.uploadedByUser
      ? `${file.date || '—'} · ${file.uploadedByUser}`
      : file.date || '—';
    tdMeta.appendChild(dateDiv);
    tr.appendChild(tdMeta);

    const tdAction = document.createElement('td');
    tdAction.style.textAlign = 'right';
    const btnOne = document.createElement('button');
    btnOne.type = 'button';
    btnOne.className = 'btn btn-sm';
    btnOne.textContent = 'Guardar';
    btnOne.disabled = isSaving;
    btnOne.addEventListener('click', () => saveFilesToChosenFolder([file]));
    tdAction.appendChild(btnOne);
    tr.appendChild(tdAction);

    filesTbody.appendChild(tr);
  }

  footerSummaryEl.textContent = `Mostrando ${filtered.length} de ${processData.files.length} archivos · ${selectedIds.size} seleccionados`;
}

function renderInfoTab() {
  infoListEl.textContent = '';
  if (!processData || processData.infoFields.length === 0) return;
  for (const field of processData.infoFields) {
    const row = document.createElement('div');
    row.className = 'info-row';
    const lbl = document.createElement('div');
    lbl.className = 'info-label';
    lbl.textContent = field.label;
    const val = document.createElement('div');
    val.className = 'info-value';
    val.textContent = field.value;
    row.appendChild(lbl);
    row.appendChild(val);
    infoListEl.appendChild(row);
  }
}

async function pickFolder() {
  if (!('showDirectoryPicker' in window)) {
    statusBannerEl.classList.remove('hidden');
    statusBannerEl.textContent = 'Tu navegador no soporta showDirectoryPicker.';
    return null;
  }
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    updateDestinationPreview();
    return dirHandle;
  } catch (err) {
    if (err?.name !== 'AbortError') {
      statusBannerEl.classList.remove('hidden');
      statusBannerEl.textContent = err?.message || 'No se pudo seleccionar la carpeta.';
    }
    return null;
  }
}

function deduplicateName(scopeKey, filename, knownExt, usedNames) {
  const lower = scopeKey.toLowerCase();
  const count = usedNames.get(lower) || 0;
  usedNames.set(lower, count + 1);
  if (count === 0) return filename;
  const dotMatch = filename.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = dotMatch?.[1] || knownExt || '';
  if (ext && filename.endsWith(ext)) {
    return `${filename.slice(0, -ext.length)}_${count + 1}${ext}`;
  }
  return `${filename}_${count + 1}`;
}

async function saveFilesToChosenFolder(filesList) {
  if (!processData || filesList.length === 0 || isSaving) return;
  if (!dirHandle) {
    const picked = await pickFolder();
    if (!picked) return;
  }

  isSaving = true;
  renderSelectionCounts();
  statusBannerEl.classList.remove('hidden');

  let saved = 0;
  let failed = 0;
  const usedNames = new Map();

  for (const file of filesList) {
    fileStatuses.set(file.id, { status: 'downloading' });
    renderTable();

    try {
      const validated = validateSercopUrl(file.downloadUrl);
      const res = await fetch(validated.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const ext = file.extension || inferExtensionFromResponse(res, validated.toString());
      const finalName = buildFinalFilename(file.tableName, ext);
      const blob = await res.blob();

      let targetDir = dirHandle;
      const scopeParts = [];
      if (chkProcessSubfolder.checked) {
        const procSeg = sanitizeFilenameBase(processData.processCode);
        scopeParts.push(procSeg);
        targetDir = await targetDir.getDirectoryHandle(procSeg, { create: true });
      }
      if (chkGroupPhase.checked && file.phase) {
        const phaseSeg = sanitizeFilenameBase(file.phase);
        scopeParts.push(phaseSeg);
        targetDir = await targetDir.getDirectoryHandle(phaseSeg, { create: true });
      }

      const uniqueName = deduplicateName(
        `${scopeParts.join('/')}/${finalName}`,
        finalName,
        ext,
        usedNames
      );
      const fh = await targetDir.getFileHandle(uniqueName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(blob);
      await writable.close();

      saved += 1;
      fileStatuses.set(file.id, { status: 'saved', resolvedName: uniqueName });
      statusBannerEl.textContent = `Guardando archivos: ${saved} de ${filesList.length} completados...`;
    } catch (err) {
      failed += 1;
      fileStatuses.set(file.id, {
        status: 'error',
        error: err?.message || 'Error al guardar',
      });
    }
    renderTable();
  }

  isSaving = false;
  renderSelectionCounts();
  statusBannerEl.textContent = `Finalizado: ${saved} archivo(s) guardados en "${dirHandle.name}"${
    failed > 0 ? ` (${failed} con error)` : ''
  }.`;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url') || '';
  const check = inspectActiveTabUrl(targetUrl);

  if (!check.ok) {
    showError('La URL no corresponde al SERCOP', check.error, targetUrl);
    return;
  }

  try {
    processData = await fetchAndParseSercopProcess(check, (done, total) => {
      probeBadgeEl.textContent = `Extensiones detectadas: ${done}/${total}`;
    });
    selectedIds = new Set(processData.files.map((f) => f.id));
    fileStatuses = new Map();

    processCodeEl.textContent = processData.processCode;
    entityNameEl.textContent = processData.entityName;
    linkTab6El.href = processData.filesTabUrl;
    linkProcessEl.href = processData.processUrl;
    filesCountLabel.textContent = `(${processData.files.length})`;

    phaseSelect.textContent = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = `Todas las fases (${processData.files.length})`;
    phaseSelect.appendChild(optAll);
    const seen = new Set();
    for (const f of processData.files) {
      if (f.phase && !seen.has(f.phase)) {
        seen.add(f.phase);
        const opt = document.createElement('option');
        opt.value = f.phase;
        opt.textContent = f.phase;
        phaseSelect.appendChild(opt);
      }
    }

    updateDestinationPreview();
    renderSelectionCounts();
    renderTable();
    renderInfoTab();

    loadingView.classList.add('hidden');
    workspaceView.classList.remove('hidden');
  } catch (err) {
    showError('Error al consultar SERCOP', err?.message || 'No se pudo cargar tab=6.', targetUrl);
  }
}

btnChooseFolder.addEventListener('click', pickFolder);
btnSaveFolder.addEventListener('click', () => {
  if (!processData) return;
  saveFilesToChosenFolder(processData.files.filter((f) => selectedIds.has(f.id)));
});
btnRefresh.addEventListener('click', init);
chkProcessSubfolder.addEventListener('change', updateDestinationPreview);
chkGroupPhase.addEventListener('change', updateDestinationPreview);
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderTable();
});
phaseSelect.addEventListener('change', (e) => {
  phaseFilter = e.target.value;
  renderTable();
});
extSegmented.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-ext]');
  if (!btn) return;
  extFilter = btn.dataset.ext;
  for (const b of extSegmented.querySelectorAll('.seg-btn')) {
    b.classList.toggle('active', b === btn);
  }
  renderTable();
});
chkSelectAll.addEventListener('change', () => {
  const filtered = getFilteredFiles();
  if (chkSelectAll.checked) {
    for (const f of filtered) selectedIds.add(f.id);
  } else {
    for (const f of filtered) selectedIds.delete(f.id);
  }
  renderSelectionCounts();
  renderTable();
});
tabArchivos.addEventListener('click', () => {
  tabArchivos.classList.add('active');
  tabInfo.classList.remove('active');
  panelArchivos.classList.remove('hidden');
  panelInfo.classList.add('hidden');
});
tabInfo.addEventListener('click', () => {
  tabInfo.classList.add('active');
  tabArchivos.classList.remove('active');
  panelInfo.classList.remove('hidden');
  panelArchivos.classList.add('hidden');
});

init();
