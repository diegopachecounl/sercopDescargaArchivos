import * as cheerio from 'cheerio';
import type {
  SercopFileItem,
  SercopInfoField,
  SercopParticipant,
  SercopProcessData,
  SercopProduct,
  SercopScheduleItem,
} from '../src/types/sercop.ts';

const SERCOP_BASE_ORIGIN = 'https://www.compraspublicas.gob.ec';
const SERCOP_PC_BASE = `${SERCOP_BASE_ORIGIN}/ProcesoContratacion/compras/PC/`;
const SERCOP_TAB_BASE = `${SERCOP_BASE_ORIGIN}/ProcesoContratacion/compras/ProcesoContratacion/`;

const ALLOWED_SERCOP_HOSTS = new Set([
  'www.compraspublicas.gob.ec',
  'compraspublicas.gob.ec',
  'portal.compraspublicas.gob.ec',
]);

const KNOWN_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'xlsm',
  'csv',
  'ppt',
  'pptx',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'xml',
  'p7m',
  'p7s',
  'sig',
  'ushay',
  'cer',
  'key',
  'eml',
  'msg',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'tif',
  'tiff',
  'bmp',
  'dwg',
  'dxf',
  'mp4',
  'mp3',
  'json',
]);

export const MIME_TO_EXT: Record<string, string> = {
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

export function validateSercopUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('URL inválida.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Solo se permiten enlaces HTTP/HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL con credenciales no permitida.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Puerto no permitido en la URL.');
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowed =
    ALLOWED_SERCOP_HOSTS.has(host) || host.endsWith('.compraspublicas.gob.ec');

  if (!isAllowed) {
    throw new Error(
      'Solo se permiten URLs oficiales del portal SERCOP (*.compraspublicas.gob.ec).'
    );
  }

  return parsed;
}

export function extractSercopTarget(input: string): {
  idSoliCompra: string;
  processUrl: string;
  filesTabUrl: string;
  providedUrlType: 'process' | 'tab' | 'id';
  normalizedInputUrl?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Ingresa una URL de SERCOP o un identificador idSoliCompra.');
  }

  if (!trimmed.includes('://') && !trimmed.includes('compraspublicas.gob.ec')) {
    if (!/^[A-Za-z0-9_\-,.=]{8,128}$/.test(trimmed)) {
      throw new Error(
        'Formato no reconocido. Pega una URL completa de compraspublicas.gob.ec o un idSoliCompra válido.'
      );
    }
    const id = encodeURIComponent(trimmed).replace(/%2C/gi, ',');
    return {
      idSoliCompra: trimmed,
      processUrl: `${SERCOP_PC_BASE}informacionProcesoContratacion2.cpe?idSoliCompra=${id}`,
      filesTabUrl: `${SERCOP_TAB_BASE}tab.php?tab=6&id=${id}`,
      providedUrlType: 'id',
    };
  }

  const candidateUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  const parsed = validateSercopUrl(candidateUrl);

  const idFromQuery =
    parsed.searchParams.get('idSoliCompra') ||
    parsed.searchParams.get('id') ||
    parsed.searchParams.get('idProceso') ||
    '';

  if (!idFromQuery) {
    return {
      idSoliCompra: '',
      processUrl: parsed.toString(),
      filesTabUrl: parsed.toString(),
      providedUrlType: parsed.pathname.toLowerCase().includes('tab.php') ? 'tab' : 'process',
      normalizedInputUrl: parsed.toString(),
    };
  }

  const encodedId = idFromQuery;
  const isTabUrl = parsed.pathname.toLowerCase().includes('tab.php');

  return {
    idSoliCompra: encodedId,
    processUrl: `${SERCOP_PC_BASE}informacionProcesoContratacion2.cpe?idSoliCompra=${encodedId}`,
    filesTabUrl: `${SERCOP_TAB_BASE}tab.php?tab=6&id=${encodedId}`,
    providedUrlType: isTabUrl ? 'tab' : 'process',
    normalizedInputUrl: parsed.toString(),
  };
}

export function sanitizeFilenameBase(rawName: string): string {
  const cleaned = rawName
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

export function extractExtensionFromText(text: string): string {
  if (!text) return '';
  const clean = text.trim().split(/[?#]/)[0];
  const match = clean.match(/\.([A-Za-z0-9]{1,8})$/);
  if (!match) return '';
  const ext = match[1].toLowerCase();
  if (KNOWN_EXTENSIONS.has(ext)) {
    return `.${ext}`;
  }
  return '';
}

export function extractExtensionFromUrl(urlStr: string): string {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr, SERCOP_TAB_BASE);
    const paramCandidates = [
      'archivo',
      'file',
      'filename',
      'nombre',
      'name',
      'doc',
      'documento',
      'ruta',
      'path',
    ];
    for (const key of paramCandidates) {
      const val = parsed.searchParams.get(key) || parsed.searchParams.get(key.toUpperCase());
      if (val) {
        const ext = extractExtensionFromText(val);
        if (ext) return ext;
      }
    }
    const pathExt = extractExtensionFromText(parsed.pathname);
    if (pathExt) return pathExt;
  } catch {
    const ext = extractExtensionFromText(urlStr);
    if (ext) return ext;
  }
  return '';
}

export function extractFilenameFromContentDisposition(headerVal: string | null): string {
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

export function buildFinalFilename(tableName: string, extension: string): string {
  const safeBase = sanitizeFilenameBase(tableName);
  const normalizedExt = extension
    ? extension.startsWith('.')
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`
    : '';

  if (!normalizedExt) {
    return safeBase;
  }

  const existingExt = extractExtensionFromText(safeBase);
  if (existingExt && existingExt.toLowerCase() === normalizedExt) {
    return safeBase;
  }
  if (safeBase.toLowerCase().endsWith(normalizedExt)) {
    return safeBase;
  }
  return `${safeBase}${normalizedExt}`;
}

export function resolveSercopHref(rawHref: string, baseContextUrl?: string): string | null {
  const trimmed = rawHref.trim();
  if (
    !trimmed ||
    trimmed === '#' ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('mailto:')
  ) {
    return null;
  }

  try {
    const base = baseContextUrl || SERCOP_TAB_BASE;
    const resolved = new URL(trimmed, base);
    const validated = validateSercopUrl(resolved.toString());
    return validated.toString();
  } catch {
    return null;
  }
}

function extractUrlFromOnclick(onclickVal: string): string | null {
  if (!onclickVal) return null;
  const singleQuoted = onclickVal.match(
    /['"]([^'"]*(?:\.php|\.cpe|bajar|descarg|archivo|download|\.pdf|\.docx?|\.xlsx?|\.zip|\.rar)[^'"]*)['"]/i
  );
  if (singleQuoted && singleQuoted[1]) {
    return singleQuoted[1];
  }
  return null;
}

function cleanText(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

function isGenericActionText(text: string): boolean {
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

function looksLikeDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{2}\/\d{2}\/\d{4}/.test(text);
}

function looksLikeSize(text: string): boolean {
  return /^\d+(?:[.,]\d+)?\s*(?:bytes|b|kb|mb|gb)$/i.test(text);
}

function looksLikeIndex(text: string): boolean {
  return /^\d{1,4}$/.test(text);
}

function parseOverlibMetadata(onmouseoverVal: string): {
  razonSocial: string;
  usuario: string;
  fecha: string;
} {
  if (!onmouseoverVal) {
    return { razonSocial: '', usuario: '', fecha: '' };
  }

  // Extract first string argument of overlib('...')
  const overlibMatch = onmouseoverVal.match(/overlib\s*\(\s*(['"])([\s\S]*?)\1\s*,/i);
  const rawHtml = overlibMatch ? overlibMatch[2] : onmouseoverVal;

  const $frag = cheerio.load(rawHtml.replace(/<br\s*\/?>/gi, '\n'));
  const plain = $frag.text();

  const razonMatch = plain.match(/Raz[oó]n Social:\s*([^\n\r]+)/i);
  const userMatch = plain.match(/Usuario:\s*([^\n\r]+)/i);
  const dateMatch = plain.match(/Fecha:\s*([^\n\r]+)/i);

  return {
    razonSocial: cleanText(razonMatch?.[1] || ''),
    usuario: cleanText(userMatch?.[1] || ''),
    fecha: cleanText(dateMatch?.[1] || ''),
  };
}

function deduplicateSuggestedFilenames(files: SercopFileItem[]): void {
  const nameCounts = new Map<string, number>();
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

export function parseFilesFromHtml(
  html: string,
  baseContextUrl: string = SERCOP_TAB_BASE
): SercopFileItem[] {
  const $ = cheerio.load(html);
  const files: SercopFileItem[] = [];
  const seenUrls = new Set<string>();

  const addCandidate = (params: {
    rawUrl: string | null;
    tableNameRaw: string;
    phaseRaw: string;
    dateRaw: string;
    sizeRaw: string;
    linkTitleOrText: string;
    uploadedByEntity?: string;
    uploadedByUser?: string;
  }) => {
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

    const suggestedFilename = buildFinalFilename(tableName, ext);

    files.push({
      id: `file-${files.length + 1}`,
      index: files.length + 1,
      tableName,
      phase: cleanText(params.phaseRaw) || 'Proceso',
      date: cleanText(params.dateRaw),
      size: cleanText(params.sizeRaw),
      extension: ext,
      suggestedFilename,
      downloadUrl: resolvedUrl,
      sourceLabel: cleanText(params.linkTitleOrText),
      uploadedByEntity: params.uploadedByEntity ? cleanText(params.uploadedByEntity) : undefined,
      uploadedByUser: params.uploadedByUser ? cleanText(params.uploadedByUser) : undefined,
    });
  };

  // Strategy 1 (SERCOP Legacy tab.php?tab=6):
  // Handles unclosed <table> tags inside <table id="rounded-corner"> and extracts overlib metadata.
  const hasSercopRoundedTables = $('table#rounded-corner').length > 0 || $('a[href*="bajarArchivo"]').length > 0;
  if (hasSercopRoundedTables) {
    let currentPhase = 'Documentos Anexos';

    // Walk all th and tr elements in document order to track section headers accurately
    // even when SERCOP leaves <table> tags unclosed.
    $('table#rounded-corner th, tr').each((_, el) => {
      const tagName = el.tagName?.toLowerCase();
      if (tagName === 'th') {
        const thText = cleanText($(el).text());
        const lowerTh = thText.toLowerCase();
        if (
          thText &&
          !lowerTh.includes('descripción del archivo') &&
          !lowerTh.includes('descripcion del archivo') &&
          !lowerTh.includes('descargar archivo')
        ) {
          currentPhase = thText;
        }
        return;
      }

      // It's a <tr>: only inspect direct child <td> cells so nested unclosed tables never leak in
      const directTds = $(el).children('td');
      if (directTds.length === 0) return;
      if (directTds.find('table').length > 0) return;

      const downloadAnchor = directTds
        .find('a[href*="bajarArchivo"], a[href*="descargar"], a[href*="download"]')
        .first();
      if (downloadAnchor.length === 0) return;

      const href = downloadAnchor.attr('href') || '';
      const onmouseover = downloadAnchor.attr('onmouseover') || '';
      const overlib = parseOverlibMetadata(onmouseover);

      // Extract description from the non-download <td> cell(s)
      let descriptionText = '';
      directTds.each((__, tdEl) => {
        if ($(tdEl).find('a[href*="bajarArchivo"], a[href*="descargar"]').length > 0) return;
        const txt = cleanText($(tdEl).text());
        if (txt && !looksLikeIndex(txt) && !isGenericActionText(txt)) {
          descriptionText = txt;
        }
      });

      addCandidate({
        rawUrl: href,
        tableNameRaw: descriptionText,
        phaseRaw: currentPhase,
        dateRaw: overlib.fecha,
        sizeRaw: '',
        linkTitleOrText: cleanText(downloadAnchor.text()) || cleanText(downloadAnchor.attr('title') || ''),
        uploadedByEntity: overlib.razonSocial,
        uploadedByUser: overlib.usuario,
      });
    });

    if (files.length > 0) {
      deduplicateSuggestedFilenames(files);
      return files;
    }
  }

  // Strategy 2: Generic HTML tables (PrimeFaces or custom tables without nested table leakage)
  $('table').each((_, tableEl) => {
    const headers: string[] = [];
    $(tableEl)
      .find('thead th, tr:first-child th')
      .each((__, th) => {
        headers.push(cleanText($(th).text()).toLowerCase());
      });

    $(tableEl)
      .find('tr')
      .each((__, trEl) => {
        const cells = $(trEl).children('td');
        if (cells.length === 0) return;
        // Skip layout rows containing nested tables
        if (cells.find('table').length > 0) return;

        const rowLinks: Array<{ url: string; text: string; onmouseover: string }> = [];
        cells.find('a, button').each((___, el) => {
          const href = $(el).attr('href') || '';
          const onclick = $(el).attr('onclick') || '';
          const onmouseover = $(el).attr('onmouseover') || '';
          const title = $(el).attr('title') || '';
          const text = cleanText($(el).text()) || cleanText(title);

          if (href && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:')) {
            rowLinks.push({ url: href, text, onmouseover });
          } else if (onclick) {
            const extracted = extractUrlFromOnclick(onclick);
            if (extracted) {
              rowLinks.push({ url: extracted, text, onmouseover });
            }
          }
        });

        if (rowLinks.length === 0) return;

        let phase = '';
        let date = '';
        let size = '';
        const textCandidates: string[] = [];

        cells.each((colIdx, tdEl) => {
          const tdText = cleanText($(tdEl).text());
          const header = headers[colIdx] || '';

          if (!tdText || looksLikeIndex(tdText)) return;

          if (header.includes('fecha') || looksLikeDate(tdText)) {
            if (!date) date = tdText;
            return;
          }
          if (header.includes('tama') || header.includes('peso') || looksLikeSize(tdText)) {
            if (!size) size = tdText;
            return;
          }
          if (
            header.includes('fase') ||
            header.includes('etapa') ||
            header.includes('tipo') ||
            header.includes('categor')
          ) {
            if (!phase) phase = tdText;
            return;
          }
          if (!isGenericActionText(tdText)) {
            textCandidates.push(tdText);
          }
        });

        let chosenName = '';
        cells.each((colIdx, tdEl) => {
          const header = headers[colIdx] || '';
          const tdText = cleanText($(tdEl).text());
          if (
            !chosenName &&
            tdText &&
            !isGenericActionText(tdText) &&
            (header.includes('archivo') ||
              header.includes('descrip') ||
              header.includes('nombre') ||
              header.includes('documento'))
          ) {
            chosenName = tdText;
          }
        });

        if (!chosenName && textCandidates.length > 0) {
          if (textCandidates.length >= 2 && !phase && textCandidates[0].length < textCandidates[1].length) {
            phase = textCandidates[0];
            chosenName = textCandidates[1];
          } else {
            chosenName = textCandidates.reduce((a, b) => (b.length > a.length ? b : a), '');
          }
        }

        for (const link of rowLinks) {
          const overlib = parseOverlibMetadata(link.onmouseover);
          const nameForThisLink =
            rowLinks.length > 1 && !isGenericActionText(link.text)
              ? link.text
              : chosenName || link.text;
          addCandidate({
            rawUrl: link.url,
            tableNameRaw: nameForThisLink,
            phaseRaw: phase,
            dateRaw: date || overlib.fecha,
            sizeRaw: size,
            linkTitleOrText: link.text,
            uploadedByEntity: overlib.razonSocial,
            uploadedByUser: overlib.usuario,
          });
        }
      });
  });

  // Strategy 3: Standalone file links outside tables
  if (files.length === 0) {
    $('a').each((_, aEl) => {
      const href = $(aEl).attr('href') || '';
      const onclick = $(aEl).attr('onclick') || '';
      const targetUrl =
        href && !href.startsWith('#') && !href.toLowerCase().startsWith('javascript:')
          ? href
          : extractUrlFromOnclick(onclick);

      if (!targetUrl) return;
      const lower = targetUrl.toLowerCase();
      const looksLikeDownload =
        lower.includes('archivo') ||
        lower.includes('bajar') ||
        lower.includes('descarg') ||
        lower.includes('download') ||
        extractExtensionFromUrl(targetUrl) !== '';

      if (!looksLikeDownload) return;
      const overlib = parseOverlibMetadata($(aEl).attr('onmouseover') || '');
      const text = cleanText($(aEl).text()) || cleanText($(aEl).attr('title') || '');
      addCandidate({
        rawUrl: targetUrl,
        tableNameRaw: text,
        phaseRaw: 'Documento',
        dateRaw: overlib.fecha,
        sizeRaw: '',
        linkTitleOrText: text,
        uploadedByEntity: overlib.razonSocial,
        uploadedByUser: overlib.usuario,
      });
    });
  }

  deduplicateSuggestedFilenames(files);
  return files;
}

export function parseSercopProcessHtml(
  processHtml: string,
  filesHtml: string,
  meta: {
    idSoliCompra: string;
    processUrl: string;
    filesTabUrl: string;
    sourceMode: 'live-sercop' | 'manual-html';
  }
): SercopProcessData {
  const warnings: string[] = [];
  const infoFields: SercopInfoField[] = [];
  const participants: SercopParticipant[] = [];
  const products: SercopProduct[] = [];
  const schedule: SercopScheduleItem[] = [];

  let processCode = '';
  let entityName = '';

  if (processHtml.trim()) {
    const $ = cheerio.load(processHtml);

    // A) PrimeFaces / OPY markup (matches ejemplo_descarga.txt)
    const stickyTitle = cleanText($('.participacion-sticky-title').first().text());
    const stickySubtitle = cleanText($('.participacion-sticky-subtitle').first().text());
    if (stickyTitle) processCode = stickyTitle;
    if (stickySubtitle) entityName = stickySubtitle;

    // B) SERCOP tab.php?tab=6 header (.frontal)
    if (!processCode) {
      $('.frontal').each((_, el) => {
        const txt = cleanText($(el).text());
        if (txt && !txt.toLowerCase().includes('documentos anexos') && /^[A-Z0-9-]{5,45}$/i.test(txt)) {
          processCode = txt;
        }
      });
    }

    const detailGrid = $('.oppy-detail-grid');
    if (detailGrid.length > 0) {
      detailGrid.find('span.label').each((_, labelEl) => {
        const label = cleanText($(labelEl).text());
        const nextEl = $(labelEl).next();
        const anchor = nextEl.is('a') ? nextEl : nextEl.find('a').first();
        const value = cleanText(nextEl.text());
        const rawHref = anchor.attr('href') || '';
        let safeHref: string | undefined;
        if (rawHref) {
          try {
            const parsedHref = new URL(rawHref, SERCOP_PC_BASE);
            if (parsedHref.protocol === 'https:' || parsedHref.protocol === 'http:') {
              safeHref = parsedHref.toString();
            }
          } catch {
            safeHref = undefined;
          }
        }
        if (label) {
          infoFields.push({
            label,
            value: value || '—',
            accent: nextEl.hasClass('participacion-proceso-valor-acento'),
            isLink: Boolean(safeHref),
            href: safeHref,
          });
        }
      });
    }

    // C) Standard SERCOP informacionProcesoContratacion2.cpe HTML tables (skip rounded-corner file tables)
    if (infoFields.length === 0 && $('table#rounded-corner').length === 0) {
      $('table tr').each((_, tr) => {
        const ths = $(tr).children('th');
        const tds = $(tr).children('td');
        if (ths.length === 1 && tds.length === 1) {
          const label = cleanText(ths.text()).replace(/:$/, '');
          const value = cleanText(tds.text());
          if (label && value && label.length < 70 && value.length < 600) {
            infoFields.push({ label, value });
          }
        } else if (tds.length === 2 && tds.find('table').length === 0) {
          const label = cleanText(tds.eq(0).text()).replace(/:$/, '');
          const value = cleanText(tds.eq(1).text());
          if (
            label &&
            value &&
            label.length < 70 &&
            value.length < 600 &&
            !label.toLowerCase().includes('descargar')
          ) {
            infoFields.push({ label, value });
          }
        }
      });
    }

    for (const f of infoFields) {
      const l = f.label.toLowerCase();
      if (!processCode && (l.includes('código') || l.includes('codigo') || l.includes('proceso'))) {
        if (/^[A-Z0-9-]{5,45}$/i.test(f.value)) {
          processCode = f.value;
        }
      }
      if (!entityName && (l.includes('entidad') || l.includes('instituci'))) {
        entityName = f.value;
      }
    }

    if (!processCode) {
      const textBlob = $('body').text() || processHtml;
      const codeMatch = textBlob.match(
        /\b(?:SIE|LICO|MCBS|MCO|COTO|CDC|RE|FI|INF|LCC|CD|PEC|BID|BM)-[A-Z0-9-]+-\d{4}\b/i
      );
      if (codeMatch) processCode = codeMatch[0].toUpperCase();
    }

    // Products from PrimeFaces export table
    $('#form-detalle-procesos-master\\:panelDetalleTabs\\:detalleProcesosProductosExportTable_data tr, .participacion-productos-tab table tbody tr').each(
      (_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 7) {
          products.push({
            cpc: cleanText(tds.eq(0).text()),
            cpcDescription: cleanText(tds.eq(1).text()),
            productDescription: cleanText(tds.eq(2).text()),
            quantity: cleanText(tds.eq(3).text()),
            unit: cleanText(tds.eq(4).text()),
            unitPrice: cleanText(tds.eq(5).text()),
            subtotal: cleanText(tds.eq(6).text()),
          });
        }
      }
    );

    // Participants from PrimeFaces export table
    $('#form-detalle-procesos-master\\:panelDetalleTabs\\:detalleProcesosParticipantesExportTable_data tr').each(
      (_, tr) => {
        if ($(tr).hasClass('ui-datatable-empty-message')) return;
        const tds = $(tr).find('td');
        if (tds.length >= 7) {
          participants.push({
            name: cleanText(tds.eq(0).text()),
            ruc: cleanText(tds.eq(1).text()),
            status: cleanText(tds.eq(2).text()),
            publishedValue: cleanText(tds.eq(3).text()),
            finalOffer: cleanText(tds.eq(4).text()),
            variation: cleanText(tds.eq(5).text()),
            proposalsCount: cleanText(tds.eq(6).text()),
          });
        }
      }
    );

    // Schedule from PrimeFaces table
    $('#form-detalle-procesos-master\\:panelDetalleTabs\\:detalleProcesosCronogramaTable_data tr').each(
      (_, tr) => {
        if ($(tr).hasClass('ui-datatable-empty-message')) return;
        const tds = $(tr).find('td');
        if (tds.length >= 2) {
          schedule.push({
            stage: cleanText(tds.eq(0).text()),
            date: cleanText(tds.eq(1).text()),
          });
        }
      }
    );
  }

  // Parse files primarily from filesHtml (tab=6), falling back to processHtml
  const filesFromTab = filesHtml.trim() ? parseFilesFromHtml(filesHtml, meta.filesTabUrl) : [];
  const filesFromProcess =
    filesFromTab.length === 0 && processHtml.trim()
      ? parseFilesFromHtml(processHtml, meta.processUrl)
      : [];

  const files = filesFromTab.length > 0 ? filesFromTab : filesFromProcess;

  // Also check .frontal in filesHtml if processCode wasn't found in processHtml
  if (!processCode && filesHtml.trim()) {
    const $f = cheerio.load(filesHtml);
    $f('.frontal').each((_, el) => {
      const txt = cleanText($f(el).text());
      if (txt && !txt.toLowerCase().includes('documentos anexos') && /^[A-Z0-9-]{5,45}$/i.test(txt)) {
        processCode = txt;
      }
    });
  }

  // Fallback entityName from first file's uploadedByEntity (the contracting entity uploads pliego/resolución first)
  if (!entityName && files.length > 0 && files[0].uploadedByEntity) {
    entityName = files[0].uploadedByEntity;
  }

  if (!processCode && meta.idSoliCompra) {
    processCode = `Proceso ${meta.idSoliCompra.slice(0, 12)}...`;
  }
  if (!entityName) {
    entityName = 'Portal Oficial SERCOP (compraspublicas.gob.ec)';
  }

  return {
    idSoliCompra: meta.idSoliCompra,
    processCode: processCode || 'Proceso SERCOP',
    entityName,
    processUrl: meta.processUrl,
    filesTabUrl: meta.filesTabUrl,
    sourceMode: meta.sourceMode,
    fetchedAt: new Date().toISOString(),
    infoFields,
    participants,
    products,
    files,
    schedule,
    warnings,
  };
}
