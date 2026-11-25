import {
  buildFinalFilename,
  inferExtensionFromResponse,
  sanitizeFilenameBase,
  validateSercopUrl,
} from './sercop-parser.js';

function deduplicateInScope(scopeKey, filename, knownExt, usedNames) {
  const lower = scopeKey.toLowerCase();
  const count = usedNames.get(lower) || 0;
  usedNames.set(lower, count + 1);
  if (count === 0) return filename;

  const dotMatch = filename.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = dotMatch?.[1] || knownExt || '';
  if (ext && filename.endsWith(ext)) {
    const stem = filename.slice(0, -ext.length);
    return `${stem}_${count + 1}${ext}`;
  }
  return `${filename}_${count + 1}`;
}

async function resolveFileExtensionIfNeeded(file) {
  if (file.extension) {
    return file.extension;
  }
  try {
    const validated = validateSercopUrl(file.downloadUrl);
    const headRes = await fetch(validated.toString(), {
      method: 'HEAD',
      credentials: 'include',
    });
    if (headRes.ok) {
      const ext = inferExtensionFromResponse(headRes, validated.toString());
      if (ext) return ext;
    }
  } catch {
    // Fallback to GET headers if HEAD fails
  }
  try {
    const validated = validateSercopUrl(file.downloadUrl);
    const controller = new AbortController();
    const res = await fetch(validated.toString(), {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });
    const ext = inferExtensionFromResponse(res, validated.toString());
    controller.abort();
    return ext || '';
  } catch {
    return '';
  }
}

function downloadSingleViaChromeApi(url, relativeFilename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: relativeFilename,
        conflictAction: 'uniquify',
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SERCOP_DOWNLOAD_BATCH') {
    handleBatchDownload(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Error en descarga' }));
    return true;
  }
  return false;
});

async function handleBatchDownload({ files, processCode, groupByPhase }) {
  const rootFolder = `SERCOP/${sanitizeFilenameBase(processCode || 'Proceso')}`;
  const usedNames = new Map();
  let saved = 0;
  let failed = 0;
  const items = [];

  for (const file of files) {
    try {
      const validated = validateSercopUrl(file.downloadUrl);
      const ext = await resolveFileExtensionIfNeeded(file);
      const finalName = buildFinalFilename(file.tableName, ext);
      const phaseSegment =
        groupByPhase && file.phase ? `${sanitizeFilenameBase(file.phase)}/` : '';
      const uniqueName = deduplicateInScope(
        `${phaseSegment}${finalName}`,
        finalName,
        ext,
        usedNames
      );
      const relativePath = `${rootFolder}/${phaseSegment}${uniqueName}`;

      await downloadSingleViaChromeApi(validated.toString(), relativePath);
      saved += 1;
      items.push({ id: file.id, status: 'saved', resolvedName: uniqueName });
      chrome.runtime.sendMessage({
        type: 'SERCOP_FILE_PROGRESS',
        fileId: file.id,
        status: 'saved',
        resolvedName: uniqueName,
      }).catch(() => {});
    } catch (err) {
      failed += 1;
      const errMsg = err?.message || 'Error al descargar';
      items.push({ id: file.id, status: 'error', error: errMsg });
      chrome.runtime.sendMessage({
        type: 'SERCOP_FILE_PROGRESS',
        fileId: file.id,
        status: 'error',
        error: errMsg,
      }).catch(() => {});
    }
  }

  return { saved, failed, rootFolder, items };
}
