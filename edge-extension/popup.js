import {
  fetchAndParseSercopProcess,
  inspectActiveTabUrl,
  sanitizeFilenameBase,
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

const btnDownloadSelected = document.getElementById('btn-download-selected');
const btnOpenFolderTab = document.getElementById('btn-open-folder-tab');
const selectedCountEl = document.getElementById('selected-count');
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

let currentTarget = null;
let processData = null;
let selectedIds = new Set();
let fileStatuses = new Map();
let searchQuery = '';
let phaseFilter = 'all';
let extFilter = 'all';
let isDownloading = false;

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
  if (!processData) return;
  const folder = sanitizeFilenameBase(processData.processCode);
  const suffix = chkGroupPhase.checked ? '/<Fase>' : '';
  destPreviewEl.textContent = `Carpeta: Descargas/SERCOP/${folder}${suffix}/`;
}

function renderTable() {
  if (!processData) return;
  const filtered = getFilteredFiles();
  filesTbody.textContent = '';

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id));
  chkSelectAll.checked = allVisibleSelected;

  if (filtered.length === 0) {
    const emptyTr = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.colSpan = 6;
    emptyTd.style.textAlign = 'center';
    emptyTd.style.padding = '24px 12px';
    emptyTd.style.color = '#64748b';
    emptyTd.textContent =
      processData.files.length === 0
        ? 'No se encontraron archivos disponibles en tab=6 para este proceso.'
        : 'Ningún archivo coincide con el filtro actual.';
    emptyTr.appendChild(emptyTd);
    filesTbody.appendChild(emptyTr);
  } else {
    for (const file of filtered) {
      const tr = document.createElement('tr');
      const isSelected = selectedIds.has(file.id);
      if (isSelected) tr.classList.add('selected');

      // Checkbox cell
      const tdChk = document.createElement('td');
      tdChk.className = 'col-check';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = isSelected;
      chk.setAttribute('aria-label', `Seleccionar ${file.tableName}`);
      chk.addEventListener('change', () => {
        if (chk.checked) selectedIds.add(file.id);
        else selectedIds.delete(file.id);
        renderSelectionCounts();
        renderTable();
      });
      tdChk.appendChild(chk);
      tr.appendChild(tdChk);

      // Index cell
      const tdNum = document.createElement('td');
      tdNum.className = 'col-num mono';
      tdNum.textContent = String(file.index);
      tr.appendChild(tdNum);

      // Title + resolved name cell
      const tdName = document.createElement('td');
      const titleDiv = document.createElement('div');
      titleDiv.className = 'file-title';
      titleDiv.textContent = file.tableName;
      const subDiv = document.createElement('div');
      subDiv.className = 'file-sub';
      const statusInfo = fileStatuses.get(file.id);
      const displayFinal = statusInfo?.resolvedName || file.suggestedFilename;
      subDiv.textContent = file.size ? `${displayFinal} · ${file.size}` : displayFinal;
      tdName.appendChild(titleDiv);
      tdName.appendChild(subDiv);
      tr.appendChild(tdName);

      // Phase cell
      const tdPhase = document.createElement('td');
      tdPhase.className = 'phase-cell';
      tdPhase.textContent = file.phase;
      tr.appendChild(tdPhase);

      // Entity / Date cell
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

      // Action cell
      const tdAction = document.createElement('td');
      tdAction.style.textAlign = 'right';
      const btnOne = document.createElement('button');
      btnOne.type = 'button';
      btnOne.className = 'btn btn-sm';
      btnOne.textContent = 'Bajar';
      btnOne.disabled = isDownloading;
      btnOne.addEventListener('click', () => downloadFiles([file]));
      tdAction.appendChild(btnOne);
      tr.appendChild(tdAction);

      filesTbody.appendChild(tr);
    }
  }

  footerSummaryEl.textContent = `Mostrando ${filtered.length} de ${processData.files.length} archivos · ${selectedIds.size} seleccionados`;
}

function renderSelectionCounts() {
  selectedCountEl.textContent = String(selectedIds.size);
  btnDownloadSelected.disabled = isDownloading || selectedIds.size === 0;
}

function renderInfoTab() {
  infoListEl.textContent = '';
  if (!processData || processData.infoFields.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '20px';
    empty.style.color = '#64748b';
    empty.style.textAlign = 'center';
    empty.textContent = 'No se detectaron campos adicionales en la ficha del proceso.';
    infoListEl.appendChild(empty);
    return;
  }

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

function populatePhaseSelect() {
  phaseSelect.textContent = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = `Todas las fases (${processData.files.length})`;
  phaseSelect.appendChild(allOpt);

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
}

async function downloadFiles(filesList) {
  if (!processData || filesList.length === 0 || isDownloading) return;
  isDownloading = true;
  renderSelectionCounts();
  statusBannerEl.classList.remove('hidden');
  statusBannerEl.textContent = `Descargando ${filesList.length} archivo(s) hacia Descargas/SERCOP/${sanitizeFilenameBase(processData.processCode)}...`;

  for (const f of filesList) {
    fileStatuses.set(f.id, { status: 'downloading' });
  }
  renderTable();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SERCOP_DOWNLOAD_BATCH',
      payload: {
        files: filesList,
        processCode: processData.processCode,
        groupByPhase: chkGroupPhase.checked,
      },
    });

    if (response?.ok) {
      const { saved, failed, rootFolder } = response.result;
      statusBannerEl.textContent = `Completado: ${saved} archivo(s) guardados en Descargas/${rootFolder}${
        failed > 0 ? ` (${failed} con error)` : ''
      }.`;
    } else {
      statusBannerEl.textContent = response?.error || 'Error al iniciar la descarga.';
    }
  } catch (err) {
    statusBannerEl.textContent = err?.message || 'Error comunicando con el servicio de descargas.';
  } finally {
    isDownloading = false;
    renderSelectionCounts();
    renderTable();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SERCOP_FILE_PROGRESS' && msg.fileId) {
    fileStatuses.set(msg.fileId, {
      status: msg.status,
      resolvedName: msg.resolvedName,
      error: msg.error,
    });
    renderTable();
  }
});

async function loadFromActiveTab() {
  errorView.classList.add('hidden');
  workspaceView.classList.add('hidden');
  loadingView.classList.remove('hidden');
  loadingSub.textContent = 'Leyendo URL de la pestaña activa...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const check = inspectActiveTabUrl(tab?.url || '');

    if (!check.ok) {
      showError(
        check.code === 'NO_PROCESS_ID'
          ? 'Proceso SERCOP no seleccionado'
          : 'La pestaña activa no corresponde al SERCOP',
        check.error,
        check.activeUrl
      );
      return;
    }

    currentTarget = check;
    loadingSub.textContent = 'Consultando pestaña tab=6 y detectando extensiones originales...';

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

    populatePhaseSelect();
    updateDestinationPreview();
    renderSelectionCounts();
    renderTable();
    renderInfoTab();

    loadingView.classList.add('hidden');
    workspaceView.classList.remove('hidden');
  } catch (err) {
    showError(
      'No se pudo consultar el proceso en SERCOP',
      err?.message || 'Verifica tu conexión al portal compraspublicas.gob.ec e intenta nuevamente.',
      currentTarget?.filesTabUrl
    );
  }
}

// Event wiring
btnRefresh.addEventListener('click', loadFromActiveTab);

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

chkGroupPhase.addEventListener('change', updateDestinationPreview);

btnDownloadSelected.addEventListener('click', () => {
  if (!processData) return;
  const chosen = processData.files.filter((f) => selectedIds.has(f.id));
  downloadFiles(chosen);
});

btnOpenFolderTab.addEventListener('click', () => {
  if (!currentTarget) return;
  const url = chrome.runtime.getURL(
    `workspace.html?url=${encodeURIComponent(currentTarget.activeUrl)}`
  );
  chrome.tabs.create({ url });
});

loadFromActiveTab();
