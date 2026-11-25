import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import JSZip from 'jszip';
import {
  buildFinalFilename,
  extractExtensionFromText,
  extractExtensionFromUrl,
  extractFilenameFromContentDisposition,
  extractSercopTarget,
  MIME_TO_EXT,
  parseSercopProcessHtml,
  validateSercopUrl,
} from './server/sercopParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const FETCH_TIMEOUT_MS = 10000;
const HEAD_TIMEOUT_MS = 3500;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
  Referer: 'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/',
};

async function fetchWithTimeout(
  urlStr: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const validated = validateSercopUrl(urlStr);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validated.toString(), {
      ...options,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        ...BROWSER_HEADERS,
        ...(options.headers as Record<string, string> | undefined),
      },
    });
    // Verify final redirected URL is still within SERCOP domain allowlist
    if (response.url) {
      validateSercopUrl(response.url);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function decodeResponseHtml(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  const buffer = await res.arrayBuffer();
  const charsetMatch = contentType.match(/charset=([^;\s]+)/i);
  const charset = (charsetMatch?.[1] || '').toLowerCase();

  if (charset.includes('iso-8859-1') || charset.includes('latin1') || charset.includes('windows-1252')) {
    return new TextDecoder('windows-1252').decode(buffer);
  }

  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  // Check meta charset inside HTML if header did not specify
  if (!charset && /charset\s*=\s*["']?(?:iso-8859-1|windows-1252)/i.test(utf8Text.slice(0, 1500))) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
  return utf8Text;
}

function inferExtensionFromHeaders(res: Response, fallbackUrl: string): string {
  const cd = res.headers.get('content-disposition');
  const cdFilename = extractFilenameFromContentDisposition(cd);
  if (cdFilename) {
    const ext = extractExtensionFromText(cdFilename);
    if (ext) return ext;
  }

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && MIME_TO_EXT[contentType]) {
    return MIME_TO_EXT[contentType];
  }

  return extractExtensionFromUrl(fallbackUrl);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Inspect a SERCOP process URL (or idSoliCompra) by fetching process page + tab=6
  app.post('/api/sercop/inspect', async (req, res) => {
    const rawInput = typeof req.body?.url === 'string' ? req.body.url : '';
    let target: ReturnType<typeof extractSercopTarget>;

    try {
      target = extractSercopTarget(rawInput);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'URL de SERCOP inválida.',
        code: 'INVALID_URL',
      });
      return;
    }

    try {
      const [filesRes, processRes] = await Promise.allSettled([
        fetchWithTimeout(target.filesTabUrl),
        target.processUrl !== target.filesTabUrl
          ? fetchWithTimeout(target.processUrl)
          : Promise.resolve(null),
      ]);

      const filesOk =
        filesRes.status === 'fulfilled' && filesRes.value !== null && filesRes.value.ok;
      const processOk =
        processRes.status === 'fulfilled' && processRes.value !== null && processRes.value.ok;

      if (!filesOk && !processOk) {
        const firstErr =
          filesRes.status === 'rejected'
            ? filesRes.reason
            : processRes.status === 'rejected'
              ? processRes.reason
              : null;

        const errName = firstErr instanceof Error ? firstErr.name : '';
        const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr || '');
        const isTimeout =
          errName === 'AbortError' ||
          errMsg.toLowerCase().includes('timeout') ||
          errMsg.toLowerCase().includes('abort');

        const httpStatus =
          filesRes.status === 'fulfilled' && filesRes.value
            ? filesRes.value.status
            : processRes.status === 'fulfilled' && processRes.value
              ? processRes.value.status
              : 0;

        res.status(502).json({
          error: isTimeout
            ? 'El portal SERCOP (compraspublicas.gob.ec) no respondió a tiempo desde el servidor en la nube.'
            : httpStatus
              ? `El portal SERCOP devolvió el estado HTTP ${httpStatus}.`
              : 'No se pudo conectar con el portal SERCOP desde el servidor.',
          code: isTimeout ? 'SERCOP_TIMEOUT' : httpStatus === 403 ? 'SERCOP_BLOCKED' : 'SERCOP_HTTP_ERROR',
          idSoliCompra: target.idSoliCompra,
          processUrl: target.processUrl,
          filesTabUrl: target.filesTabUrl,
          details: errMsg || undefined,
        });
        return;
      }

      const filesHtml =
        filesRes.status === 'fulfilled' && filesRes.value && filesRes.value.ok
          ? await decodeResponseHtml(filesRes.value)
          : '';
      const processHtml =
        processRes.status === 'fulfilled' && processRes.value && processRes.value.ok
          ? await decodeResponseHtml(processRes.value)
          : '';

      const parsed = parseSercopProcessHtml(processHtml, filesHtml, {
        idSoliCompra: target.idSoliCompra,
        processUrl: target.processUrl,
        filesTabUrl: target.filesTabUrl,
        sourceMode: 'live-sercop',
      });

      // Probe files lacking known extension via batched HEAD requests to discover original Content-Disposition / Content-Type
      const missingExt = parsed.files.filter((f) => !f.extension).slice(0, 100);
      const BATCH_SIZE = 8;
      for (let i = 0; i < missingExt.length; i += BATCH_SIZE) {
        const batch = missingExt.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (file) => {
            try {
              const headRes = await fetchWithTimeout(file.downloadUrl, {
                method: 'HEAD',
                timeoutMs: HEAD_TIMEOUT_MS,
              });
              if (headRes.ok) {
                const ext = inferExtensionFromHeaders(headRes, file.downloadUrl);
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
              // Ignore probe failure; extension will still resolve during actual download
            }
          })
        );
      }

      res.json(parsed);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error inesperado al consultar SERCOP.',
        code: 'PARSE_ERROR',
        idSoliCompra: target.idSoliCompra,
        processUrl: target.processUrl,
        filesTabUrl: target.filesTabUrl,
      });
    }
  });

  // Parse pasted or uploaded SERCOP HTML (for local-browser fallback when cloud IP is blocked)
  app.post('/api/sercop/parse-html', (req, res) => {
    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    const processHtml = typeof req.body?.processHtml === 'string' ? req.body.processHtml : '';
    const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl : '';

    if (!html.trim() && !processHtml.trim()) {
      res.status(400).json({ error: 'El HTML proporcionado está vacío.' });
      return;
    }

    let idSoliCompra = typeof req.body?.idSoliCompra === 'string' ? req.body.idSoliCompra : '';
    let processUrl = 'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe';
    let filesTabUrl = 'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/ProcesoContratacion/tab.php?tab=6';

    if (sourceUrl.trim()) {
      try {
        const target = extractSercopTarget(sourceUrl);
        idSoliCompra = target.idSoliCompra || idSoliCompra;
        processUrl = target.processUrl;
        filesTabUrl = target.filesTabUrl;
      } catch {
        // Keep defaults if sourceUrl is optional
      }
    }

    const combinedProcessHtml = processHtml.trim() ? processHtml : html;
    const parsed = parseSercopProcessHtml(combinedProcessHtml, html, {
      idSoliCompra,
      processUrl,
      filesTabUrl,
      sourceMode: 'manual-html',
    });

    res.json(parsed);
  });

  // Proxy download endpoint preserving table name + original extension from SERCOP headers
  app.get('/api/sercop/download', async (req, res) => {
    const rawFileUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const requestedName = typeof req.query.filename === 'string' ? req.query.filename : 'archivo_sercop';
    const knownExt = typeof req.query.ext === 'string' ? req.query.ext : '';

    let validatedUrl: URL;
    try {
      validatedUrl = validateSercopUrl(rawFileUrl);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'URL de archivo inválida.',
      });
      return;
    }

    try {
      const upstream = await fetchWithTimeout(validatedUrl.toString(), {
        method: 'GET',
        timeoutMs: 30000,
        headers: {
          ...BROWSER_HEADERS,
          Accept: '*/*',
        },
      });

      if (!upstream.ok || !upstream.body) {
        res.status(502).json({
          error: `SERCOP devolvió estado ${upstream.status} al descargar el archivo.`,
        });
        return;
      }

      const detectedExt = inferExtensionFromHeaders(upstream, validatedUrl.toString()) || knownExt;
      const finalFilename = buildFinalFilename(requestedName, detectedExt);

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstream.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const asciiFallback = finalFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
      const utf8Encoded = encodeURIComponent(finalFilename);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`
      );
      res.setHeader('X-Resolved-Filename', utf8Encoded);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Resolved-Filename');

      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream);
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      res.status(502).json({
        error: isTimeout
          ? 'Tiempo de espera agotado al descargar el archivo desde SERCOP.'
          : 'No se pudo descargar el archivo desde SERCOP.',
      });
    }
  });

  // Bundle the Edge Manifest V3 extension into a downloadable ZIP
  app.get('/api/extension/download-zip', async (_req, res) => {
    const extRoot = path.resolve(__dirname, 'edge-extension');
    if (!fs.existsSync(extRoot)) {
      res.status(404).json({ error: 'No se encontró la carpeta edge-extension.' });
      return;
    }

    try {
      const zip = new JSZip();
      const addDirRecursive = (currentDir: string, relBase: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.resolve(currentDir, entry.name);
          if (!fullPath.startsWith(extRoot + path.sep)) continue;
          const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            addDirRecursive(fullPath, relPath);
          } else if (entry.isFile()) {
            zip.file(relPath, fs.readFileSync(fullPath));
          }
        }
      };

      addDirRecursive(extRoot, '');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="sercop-edge-extension.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch {
      res.status(500).json({ error: 'No se pudo empaquetar la extensión de Edge.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERCOP File Downloader server running on http://localhost:${PORT}`);
  });
}

startServer();
