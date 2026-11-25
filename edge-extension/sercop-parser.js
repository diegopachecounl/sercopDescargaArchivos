const SERCOP_BASE_ORIGIN = 'https://www.compraspublicas.gob.ec';
const SERCOP_PC_BASE = `${SERCOP_BASE_ORIGIN}/ProcesoContratacion/compras/PC/`;
const SERCOP_TAB_BASE = `${SERCOP_BASE_ORIGIN}/ProcesoContratacion/compras/ProcesoContratacion/`;

const ALLOWED_SERCOP_HOSTS = new Set([
  'www.compraspublicas.gob.ec',
  'compraspublicas.gob.ec',
  'portal.compraspublicas.gob.ec',
]);

const KNOWN_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'tar', 'gz', 'xml', 'p7m', 'p7s', 'sig', 'ushay',
  'cer', 'key', 'eml', 'msg', 'txt', 'rtf', 'odt', 'ods', 'odp',
  'jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'bmp', 'dwg', 'dxf',
  'mp4', 'mp3', 'json',
]);

export const MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
  'application/x-7z-compressed': '.7z',
  'application/xml': '.xml',
  'text/xml': '.xml',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/rtf': '.rtf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/tiff': '.tif',
  'application/pkcs7-mime': '.p7m',
  'application/pkcs7-signature': '.p7s',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
};

export function isSercopHost(hostname) {
  const host = (hostname || '').toLowerCase();
  return ALLOWED_SERCOP_HOSTS.has(host) || host.endsWith('.compraspublicas.gob.ec');
}

export function validateSercopUrl(rawUrl) {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Protocolo no permitido.');
  }
  if (!isSercopHost(parsed.hostname)) {
    throw new Error('La URL no corresponde al portal oficial del SERCOP.');
  }
  return parsed;
}

export function inspectActiveTabUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      ok: false,
      code: 'NOT_SERCOP',
      error: 'No se pudo leer la URL de la pestaña activa.',
    };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      code: 'NOT_SERCOP',
      error: 'La pestaña activa no contiene una URL web válida del SERCOP.',
    };
  }

  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !isSercopHost(parsed.hostname)) {
    return {
      ok: false,
      code: 'NOT_SERCOP',
      error: 'La URL de la pestaña activa no corresponde al portal SERCOP (compraspublicas.gob.ec).',
      activeUrl: rawUrl,
    };
  }

  const idSoliCompra =
    parsed.searchParams.get('idSoliCompra') ||
    parsed.searchParams.get('id') ||
    parsed.searchParams.get('idProceso') ||
    '';

  if (!idSoliCompra) {
    return {
      ok: false,
      code: 'NO_PROCESS_ID',
      error: 'Estás en el portal SERCOP, pero esta página no contiene un parámetro de proceso (idSoliCompra o id). Abre la ficha de un proceso para consultar sus archivos.',
      activeUrl: rawUrl,
    };
  }

  const processUrl = `${SERCOP_PC_BASE}informacionProcesoContratacion2.cpe?idSoliCompra=${idSoliCompra}`;
  const filesTabUrl = `${SERCOP_TAB_BASE}tab.php?tab=6&id=${idSoliCompra}`;

  return {
    ok: true,
    idSoliCompra,
    processUrl,
    filesTabUrl,
    activeUrl: rawUrl,
  };
}

export function sanitizeFilenameBase(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'archivo_sercop';
  }
  return cleaned.slice(0, 180);
}

export function extractExtensionFromText(text) {
  if (!text) return '';
  const clean = text.trim().split(/[?#]/)[0];
  const match = clean.match(/\.([A-Za-z0-9]{1,8})$/);
  if (!match) return '';
  const ext = match[1].toLowerCase();
  return KNOWN_EXTENSIONS.has(ext) ? `.${ext}` : '';
}

export function extractExtensionFromUrl(urlStr) {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr, SERCOP_TAB_BASE);
    const params = ['archivo', 'file', 'filename', 'nombre', 'name', 'doc', 'documento', 'ruta', 'path'];
    for (const key of params) {
      const val = parsed.searchParams.get(key) || parsed.searchParams.get(key.toUpperCase());
      if (val) {
        const ext = extractExtensionFromText(val);
        if (ext) return ext;
      }
    }
    const pathExt = extractExtensionFromText(parsed.pathname);
    if (pathExt) return pathExt;
  } catch {
    return extractExtensionFromText(urlStr);
  }
  return '';
}

export function extractFilenameFromContentDisposition(headerVal) {
  if (!headerVal) return '';
  const starMatch = headerVal.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')?([^;\r\n]+)/i);
  if (starMatch && starMatch[1]) {
    try {
      const decoded = decodeURIComponent(starMatch[1].trim().replace(/^["']|["']$/g, ''));
      if (decoded) return decoded;
    } catch {
      return starMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  const plainMatch = headerVal.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;\r\n]+)/i);
  if (plainMatch) {
    return (plainMatch[1] || plainMatch[2] || '').trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

export function inferExtensionFromResponse(res, fallbackUrl) {
  const cd = res.headers.get('content-disposition');
  const cdFilename = extractFilenameFromContentDisposition(cd);
  if (cdFilename) {
    const ext = extractExtensionFromText(cdFilename);
    if (ext) return ext;
  }
  const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (ct && MIME_TO_EXT[ct]) {
    return MIME_TO_EXT[ct];
  }
  return extractExtensionFromUrl(fallbackUrl);
}

export function buildFinalFilename(tableName, extension) {
  const safeBase = sanitizeFilenameBase(tableName);
  const normalizedExt = extension
    ? extension.startsWith('.')
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`
    : '';

  if (!normalizedExt) return safeBase;
  const existingExt = extractExtensionFromText(safeBase);
  if (existingExt && existingExt.toLowerCase() === normalizedExt) {
    return safeBase;
  }
  if (safeBase.toLowerCase().endsWith(normalizedExt)) {
    return safeBase;
  }
  return `${safeBase}${normalizedExt}`;
}

function cleanText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

function isGenericActionText(text) {
  const lower = text.toLowerCase().trim();
  return (
    !lower ||
    lower === 'descargar' ||
    lower === 'bajar' ||
    lower === 'ver' ||
    lower === 'abrir' ||
    lower === 'download' ||
    lower === 'archivo' ||
    lower === 'pdf' ||
    lower === 'doc' ||
    lower === 'xls' ||
    lower === 'click aquí' ||
    lower === 'clic aquí' ||
    lower === 'aqui' ||
    lower === 'aquí'
  );
}

function looksLikeIndex(text) {
  return /^\d{1,4}$/.test(text);
}

function looksLikeDate(text) {
  return /^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{2}\/\d{2}\/\d{4}/.test(text);
}

function looksLikeSize(text) {
  return /^\d+(?:[.,]\d+)?\s*(?:bytes|b|kb|mb|gb)$/i.test(text);
}

function resolveSercopHref(rawHref, baseContextUrl) {
  const trimmed = (rawHref || '').trim();
  if (
    !trimmed ||
    trimmed === '#' ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('mailto:')
  ) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, baseContextUrl || SERCOP_TAB_BASE);
    return validateSercopUrl(resolved.toString()).toString();
  } catch {
    return null;
  }
}

function parseOverlibMetadata(onmouseoverVal) {
  if (!onmouseoverVal) {
    return { razonSocial: '', usuario: '', fecha: '' };
  }
  const overlibMatch = onmouseoverVal.match(/overlib\s*\(\s*(['"])([\s\S]*?)\1\s*,/i);
  const rawHtml = overlibMatch ? overlibMatch[2] : onmouseoverVal;

  const doc = new DOMParser().parseFromString(rawHtml.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  const plain = doc.body?.textContent || '';

  const razonMatch = plain.match(/Raz[oó]n Social:\s*([^\n\r]+)/i);
  const userMatch = plain.match(/Usuario:\s*([^\n\r]+)/i);
  const dateMatch = plain.match(/Fecha:\s*([^\n\r]+)/i);

  return {
    razonSocial: cleanText(razonMatch?.[1] || ''),
    usuario: cleanText(userMatch?.[1] || ''),
    fecha: cleanText(dateMatch?.[1] || ''),
  };
}

function deduplicateSuggestedFilenames(files) {
  const nameCounts = new Map();
  for (const file of files) {
    const key = file.suggestedFilename.toLowerCase();
    const count = nameCounts.get(key) || 0;
    nameCounts.set(key, count + 1);
    if (count > 0) {
      const ext = file.extension;
      if (ext && file.suggestedFilename.toLowerCase().endsWith(ext.toLowerCase())) {
        const stem = file.suggestedFilename.slice(0, -ext.length);
        file.suggestedFilename = `${stem}_${count + 1}${ext}`;
      } else {
        file.suggestedFilename = `${file.suggestedFilename}_${count + 1}`;
      }
    }
  }
}

export function parseFilesFromDocument(doc, baseContextUrl = SERCOP_TAB_BASE) {
  const files = [];
  const seenUrls = new Set();

  const addCandidate = (params) => {
    if (!params.rawUrl) return;
    const resolvedUrl = resolveSercopHref(params.rawUrl, baseContextUrl);
    if (!resolvedUrl) return;

    const lowerUrl = resolvedUrl.toLowerCase();
    if (
      lowerUrl.endsWith('.css') ||
      lowerUrl.endsWith('.js') ||
      lowerUrl.includes('tab.php?') ||
      lowerUrl.includes('informacionprocesocontratacion')
    ) {
      return;
    }

    if (seenUrls.has(resolvedUrl)) return;
    seenUrls.add(resolvedUrl);

    const tableName =
      cleanText(params.tableNameRaw) ||
      cleanText(params.linkTitleOrText) ||
      `Archivo_${files.length + 1}`;

    const ext =
      extractExtensionFromText(tableName) ||
      extractExtensionFromUrl(resolvedUrl) ||
      extractExtensionFromText(params.linkTitleOrText);

    files.push({
      id: `file-${files.length + 1}`,
      index: files.length + 1,
      tableName,
      phase: cleanText(params.phaseRaw) || 'Proceso',
      date: cleanText(params.dateRaw),
      size: cleanText(params.sizeRaw),
      extension: ext,
      suggestedFilename: buildFinalFilename(tableName, ext),
      downloadUrl: resolvedUrl,
      uploadedByEntity: params.uploadedByEntity ? cleanText(params.uploadedByEntity) : '',
      uploadedByUser: params.uploadedByUser ? cleanText(params.uploadedByUser) : '',
    });
  };

  // Strategy 1: SERCOP legacy tab.php?tab=6 (<table id="rounded-corner"> + overlib + ../PC/bajarArchivo.cpe)
  const hasRoundedCorner =
    doc.querySelectorAll('table#rounded-corner').length > 0 ||
    doc.querySelectorAll('a[href*="bajarArchivo"]').length > 0;

  if (hasRoundedCorner) {
    let currentPhase = 'Documentos Anexos';
    const elements = doc.querySelectorAll('table#rounded-corner th, tr');

    for (const el of elements) {
      if (el.tagName.toLowerCase() === 'th') {
        const thText = cleanText(el.textContent);
        const lowerTh = thText.toLowerCase();
        if (
          thText &&
          !lowerTh.includes('descripción del archivo') &&
          !lowerTh.includes('descripcion del archivo') &&
          !lowerTh.includes('descargar archivo')
        ) {
          currentPhase = thText;
        }
        continue;
      }

      const directTds = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'td');
      if (directTds.length === 0) continue;
      if (directTds.some((td) => td.querySelector('table'))) continue;

      const anchor = el.querySelector('a[href*="bajarArchivo"], a[href*="descargar"], a[href*="download"]');
      if (!anchor) continue;

      const href = anchor.getAttribute('href') || '';
      const onmouseover = anchor.getAttribute('onmouseover') || '';
      const overlib = parseOverlibMetadata(onmouseover);

      let descriptionText = '';
      for (const td of directTds) {
        if (td.querySelector('a[href*="bajarArchivo"], a[href*="descargar"]')) continue;
        const txt = cleanText(td.textContent);
        if (txt && !looksLikeIndex(txt) && !isGenericActionText(txt)) {
          descriptionText = txt;
          break;
        }
      }

      addCandidate({
        rawUrl: href,
        tableNameRaw: descriptionText,
        phaseRaw: currentPhase,
        dateRaw: overlib.fecha,
        sizeRaw: '',
        linkTitleOrText: cleanText(anchor.textContent) || cleanText(anchor.getAttribute('title')),
        uploadedByEntity: overlib.razonSocial,
        uploadedByUser: overlib.usuario,
      });
    }

    if (files.length > 0) {
      deduplicateSuggestedFilenames(files);
      return files;
    }
  }

  // Strategy 2: Generic tables
  for (const tableEl of doc.querySelectorAll('table')) {
    const headers = Array.from(tableEl.querySelectorAll('thead th, tr:first-child th')).map((th) =>
      cleanText(th.textContent).toLowerCase()
    );

    for (const trEl of tableEl.querySelectorAll('tr')) {
      const cells = Array.from(trEl.children).filter((c) => c.tagName.toLowerCase() === 'td');
      if (cells.length === 0 || cells.some((td) => td.querySelector('table'))) continue;

      const anchors = Array.from(trEl.querySelectorAll('a[href]')).filter((a) => {
        const href = (a.getAttribute('href') || '').trim();
        return href && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:');
      });
      if (anchors.length === 0) continue;

      let phase = '';
      let date = '';
      let size = '';
      const candidates = [];

      cells.forEach((td, idx) => {
        const txt = cleanText(td.textContent);
        const header = headers[idx] || '';
        if (!txt || looksLikeIndex(txt)) return;
        if (header.includes('fecha') || looksLikeDate(txt)) {
          if (!date) date = txt;
          return;
        }
        if (header.includes('tama') || header.includes('peso') || looksLikeSize(txt)) {
          if (!size) size = txt;
          return;
        }
        if (header.includes('fase') || header.includes('etapa') || header.includes('tipo')) {
          if (!phase) phase = txt;
          return;
        }
        if (!isGenericActionText(txt)) candidates.push(txt);
      });

      const chosenName = candidates.reduce((a, b) => (b.length > a.length ? b : a), '');
      for (const a of anchors) {
        const overlib = parseOverlibMetadata(a.getAttribute('onmouseover') || '');
        const linkTxt = cleanText(a.textContent) || cleanText(a.getAttribute('title'));
        addCandidate({
          rawUrl: a.getAttribute('href'),
          tableNameRaw: anchors.length > 1 && !isGenericActionText(linkTxt) ? linkTxt : chosenName || linkTxt,
          phaseRaw: phase,
          dateRaw: date || overlib.fecha,
          sizeRaw: size,
          linkTitleOrText: linkTxt,
          uploadedByEntity: overlib.razonSocial,
          uploadedByUser: overlib.usuario,
        });
      }
    }
  }

  deduplicateSuggestedFilenames(files);
  return files;
}

export async function decodeHtmlResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  const buffer = await res.arrayBuffer();
  const charsetMatch = contentType.match(/charset=([^;\s]+)/i);
  const charset = (charsetMatch?.[1] || '').toLowerCase();

  if (charset.includes('iso-8859-1') || charset.includes('latin1') || charset.includes('windows-1252')) {
    return new TextDecoder('windows-1252').decode(buffer);
  }

  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (!charset && /charset\s*=\s*["']?(?:iso-8859-1|windows-1252)/i.test(utf8Text.slice(0, 1500))) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
  return utf8Text;
}

export async function fetchAndParseSercopProcess(target, onProbeProgress) {
  const [filesRes, processRes] = await Promise.allSettled([
    fetch(target.filesTabUrl, { credentials: 'include' }),
    fetch(target.processUrl, { credentials: 'include' }),
  ]);

  const filesOk = filesRes.status === 'fulfilled' && filesRes.value.ok;
  const processOk = processRes.status === 'fulfilled' && processRes.value.ok;

  if (!filesOk && !processOk) {
    const statusCode =
      filesRes.status === 'fulfilled'
        ? filesRes.value.status
        : processRes.status === 'fulfilled'
          ? processRes.value.status
          : 0;
    throw new Error(
      statusCode
        ? `SERCOP devolvió el estado HTTP ${statusCode} al consultar tab=6.`
        : 'No se pudo conectar con compraspublicas.gob.ec desde tu navegador.'
    );
  }

  const filesHtml = filesOk ? await decodeHtmlResponse(filesRes.value) : '';
  const processHtml = processOk ? await decodeHtmlResponse(processRes.value) : '';

  const filesDoc = new DOMParser().parseFromString(filesHtml || '<html></html>', 'text/html');
  const processDoc = new DOMParser().parseFromString(processHtml || '<html></html>', 'text/html');

  const files = parseFilesFromDocument(filesDoc, target.filesTabUrl);

  // Extract processCode
  let processCode = '';
  for (const el of filesDoc.querySelectorAll('.frontal')) {
    const txt = cleanText(el.textContent);
    if (txt && !txt.toLowerCase().includes('documentos anexos') && /^[A-Z0-9-]{5,45}$/i.test(txt)) {
      processCode = txt;
      break;
    }
  }

  // Extract info fields from informacionProcesoContratacion2.cpe
  const infoFields = [];
  let entityName = '';

  if (processHtml.trim()) {
    for (const tr of processDoc.querySelectorAll('table tr')) {
      const ths = Array.from(tr.children).filter((c) => c.tagName.toLowerCase() === 'th');
      const tds = Array.from(tr.children).filter((c) => c.tagName.toLowerCase() === 'td');
      let label = '';
      let value = '';
      if (ths.length === 1 && tds.length === 1) {
        label = cleanText(ths[0].textContent).replace(/:$/, '');
        value = cleanText(tds[0].textContent);
      } else if (tds.length === 2 && !tds[0].querySelector('table') && !tds[1].querySelector('table')) {
        label = cleanText(tds[0].textContent).replace(/:$/, '');
        value = cleanText(tds[1].textContent);
      }
      if (label && value && label.length < 70 && value.length < 600 && !label.toLowerCase().includes('descargar')) {
        infoFields.push({ label, value });
        const lower = label.toLowerCase();
        if (!processCode && (lower.includes('código') || lower.includes('codigo')) && /^[A-Z0-9-]{5,45}$/i.test(value)) {
          processCode = value;
        }
        if (!entityName && (lower.includes('entidad') || lower.includes('instituci'))) {
          entityName = value;
        }
      }
    }

    if (!processCode) {
      const match = (processDoc.body?.textContent || '').match(
        /\b(?:SIE|LICO|MCBS|MCO|COTO|CDC|RE|FI|INF|LCC|CD|PEC|BID|BM)-[A-Z0-9-]+-\d{4}\b/i
      );
      if (match) processCode = match[0].toUpperCase();
    }
  }

  if (!entityName && files.length > 0 && files[0].uploadedByEntity) {
    entityName = files[0].uploadedByEntity;
  }

  // Batched HEAD probes to discover original extensions (.pdf, .docx, .zip, etc.) directly from Edge
  const missingExt = files.filter((f) => !f.extension);
  const BATCH_SIZE = 8;
  for (let i = 0; i < missingExt.length; i += BATCH_SIZE) {
    const batch = missingExt.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (file) => {
        try {
          const headRes = await fetch(file.downloadUrl, {
            method: 'HEAD',
            credentials: 'include',
          });
          if (headRes.ok) {
            const ext = inferExtensionFromResponse(headRes, file.downloadUrl);
            if (ext) {
              file.extension = ext;
              file.suggestedFilename = buildFinalFilename(file.tableName, ext);
            }
            const len = headRes.headers.get('content-length');
            if (!file.size && len && /^\d+$/.test(len)) {
              const bytes = Number(len);
              file.size =
                bytes >= 1024 * 1024
                  ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
                  : `${Math.max(1, Math.round(bytes / 1024))} KB`;
            }
          }
        } catch {
          // Will resolve extension during download if HEAD is blocked
        }
      })
    );
    if (onProbeProgress) {
      onProbeProgress(Math.min(i + BATCH_SIZE, missingExt.length), missingExt.length);
    }
  }

  // Re-deduplicate now that extensions are populated
  deduplicateSuggestedFilenames(files);

  return {
    idSoliCompra: target.idSoliCompra,
    processCode: processCode || `Proceso_${target.idSoliCompra.slice(0, 12)}`,
    entityName: entityName || 'Portal Oficial SERCOP (compraspublicas.gob.ec)',
    processUrl: target.processUrl,
    filesTabUrl: target.filesTabUrl,
    infoFields,
    files,
  };
}
