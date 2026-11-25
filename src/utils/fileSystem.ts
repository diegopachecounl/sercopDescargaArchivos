import JSZip from 'jszip';
import type { FileDownloadStatus, SercopFileItem } from '../types/sercop';

export interface DirectoryHandleLike {
  name: string;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<DirectoryHandleLike>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function sanitizeFsSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned || 'SERCOP_Proceso';
}

export async function pickLocalDirectory(): Promise<{
  handle: DirectoryHandleLike | null;
  error: string | null;
  blockedByIframe: boolean;
}> {
  if (!isFileSystemAccessSupported()) {
    return {
      handle: null,
      error:
        'Tu navegador no admite la selección directa de carpetas (File System Access API). Puedes usar Descarga ZIP o Descarga directa.',
      blockedByIframe: false,
    };
  }

  try {
    const picker = (
      window as unknown as {
        showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
      }
    ).showDirectoryPicker;
    const handle = await picker({ mode: 'readwrite' });
    return { handle, error: null, blockedByIframe: false };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { handle: null, error: null, blockedByIframe: false };
      }
      if (
        err.name === 'SecurityError' ||
        err.message.toLowerCase().includes('cross origin') ||
        err.message.toLowerCase().includes('sub frame')
      ) {
        return {
          handle: null,
          error:
            'El navegador bloquea el selector directo de carpetas dentro de un marco embebido. Usa Descarga en ZIP, Descarga individual o abre la app en pestaña completa.',
          blockedByIframe: true,
        };
      }
      return { handle: null, error: err.message, blockedByIframe: false };
    }
    return {
      handle: null,
      error: 'No se pudo abrir el selector de carpeta local.',
      blockedByIframe: false,
    };
  }
}

export async function saveBlobToDirectory(
  rootHandle: DirectoryHandleLike,
  subfolderSegments: string[],
  filename: string,
  blob: Blob
): Promise<void> {
  let targetDir = rootHandle;
  for (const segment of subfolderSegments) {
    if (segment && segment.trim()) {
      targetDir = await targetDir.getDirectoryHandle(sanitizeFsSegment(segment), {
        create: true,
      });
    }
  }
  const safeFile = sanitizeFsSegment(filename);
  const fileHandle = await targetDir.getFileHandle(safeFile, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function fetchSercopFileBlob(
  file: SercopFileItem
): Promise<{ blob: Blob; resolvedFilename: string }> {
  const params = new URLSearchParams({
    url: file.downloadUrl,
    filename: file.tableName || file.suggestedFilename,
    ext: file.extension || '',
  });

  const response = await fetch(`/api/sercop/download?${params.toString()}`);
  if (!response.ok) {
    let message = `Error HTTP ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore non-json error body
    }
    throw new Error(message);
  }

  const resolvedHeader = response.headers.get('X-Resolved-Filename');
  let resolvedFilename = file.suggestedFilename;
  if (resolvedHeader) {
    try {
      resolvedFilename = decodeURIComponent(resolvedHeader);
    } catch {
      resolvedFilename = file.suggestedFilename;
    }
  }

  const blob = await response.blob();
  return { blob, resolvedFilename };
}

export function triggerBlobDownload(filename: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}

export async function downloadFilesToFolder(
  files: SercopFileItem[],
  rootHandle: DirectoryHandleLike,
  processSubfolder: string | null,
  groupByPhase: boolean,
  onStatus: (fileId: string, status: FileDownloadStatus, resolvedName?: string, errorMsg?: string) => void
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  const usedNames = new Map<string, number>();

  for (const file of files) {
    onStatus(file.id, 'downloading');
    try {
      const { blob, resolvedFilename } = await fetchSercopFileBlob(file);
      const segments: string[] = [];
      if (processSubfolder) segments.push(processSubfolder);
      if (groupByPhase && file.phase) segments.push(file.phase);
      const folderKey = segments.map((s) => sanitizeFsSegment(s)).join('/');
      const uniqueName = deduplicateName(`${folderKey}/${resolvedFilename}`, resolvedFilename, file.extension, usedNames);
      await saveBlobToDirectory(rootHandle, segments, uniqueName, blob);
      saved += 1;
      onStatus(file.id, 'saved', uniqueName);
    } catch (err) {
      failed += 1;
      onStatus(
        file.id,
        'error',
        undefined,
        err instanceof Error ? err.message : 'Error al guardar archivo'
      );
    }
  }

  return { saved, failed };
}

export async function downloadFilesAsZip(
  files: SercopFileItem[],
  zipFilename: string,
  groupByPhase: boolean,
  onStatus: (fileId: string, status: FileDownloadStatus, resolvedName?: string, errorMsg?: string) => void
): Promise<{ saved: number; failed: number }> {
  const zip = new JSZip();
  let saved = 0;
  let failed = 0;
  const usedNames = new Map<string, number>();

  for (const file of files) {
    onStatus(file.id, 'downloading');
    try {
      const { blob, resolvedFilename } = await fetchSercopFileBlob(file);
      const phaseDir = groupByPhase && file.phase ? sanitizeFsSegment(file.phase) : '';
      const keyPrefix = phaseDir ? `${phaseDir}/` : '';
      const uniqueName = deduplicateName(`${keyPrefix}${resolvedFilename}`, resolvedFilename, file.extension, usedNames);
      zip.file(`${keyPrefix}${uniqueName}`, blob);
      saved += 1;
      onStatus(file.id, 'saved', uniqueName);
    } catch (err) {
      failed += 1;
      onStatus(
        file.id,
        'error',
        undefined,
        err instanceof Error ? err.message : 'Error al descargar archivo'
      );
    }
  }

  if (saved > 0) {
    const content = await zip.generateAsync({ type: 'blob' });
    triggerBlobDownload(zipFilename, content);
  }

  return { saved, failed };
}

function deduplicateName(
  scopeKey: string,
  filename: string,
  knownExt: string,
  usedNames: Map<string, number>
): string {
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

export function generateDownloadScript(
  files: SercopFileItem[],
  format: 'powershell' | 'bash',
  folderName: string,
  groupByPhase: boolean = false
): string {
  const safeFolder = sanitizeFsSegment(folderName || 'SERCOP_Archivos');

  if (format === 'powershell') {
    const lines = [
      '# Script de descarga directa desde SERCOP (compraspublicas.gob.ec)',
      `# Carpeta de destino: .\\${safeFolder}`,
      '$ErrorActionPreference = "Continue"',
      `$destRoot = Join-Path (Get-Location) "${safeFolder.replace(/"/g, '')}"`,
      'New-Item -ItemType Directory -Force -Path $destRoot | Out-Null',
      '',
      '$mimeMap = @{',
      '  "application/pdf" = ".pdf"',
      '  "application/msword" = ".doc"',
      '  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" = ".docx"',
      '  "application/vnd.ms-excel" = ".xls"',
      '  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" = ".xlsx"',
      '  "application/zip" = ".zip"',
      '  "application/x-zip-compressed" = ".zip"',
      '  "application/x-rar-compressed" = ".rar"',
      '  "application/vnd.rar" = ".rar"',
      '  "application/x-7z-compressed" = ".7z"',
      '  "application/xml" = ".xml"',
      '  "text/xml" = ".xml"',
      '  "text/plain" = ".txt"',
      '  "text/csv" = ".csv"',
      '  "image/jpeg" = ".jpg"',
      '  "image/png" = ".png"',
      '}',
      '',
      'function Get-SercopFile($url, $baseName, $knownExt, $subFolder) {',
      '  $targetDir = if ($subFolder) { Join-Path $destRoot $subFolder } else { $destRoot }',
      '  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null',
      '  Write-Host "Descargando: $baseName ..."',
      '  try {',
      '    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ "Referer" = "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/ProcesoContratacion/tab.php" }',
      '    $ext = $knownExt',
      '    $cd = [string]$resp.Headers["Content-Disposition"]',
      '    if (-not $ext -and $cd -match \'filename\\*?=(?:UTF-8\'\')?"?[^"\\r\\n]+?(\\.[a-zA-Z0-9]{1,8})"?\') {',
      '      $ext = $Matches[1].ToLower()',
      '    }',
      '    if (-not $ext) {',
      '      $ct = ([string]$resp.Headers["Content-Type"]).Split(";")[0].Trim().ToLower()',
      '      if ($mimeMap.ContainsKey($ct)) { $ext = $mimeMap[$ct] }',
      '    }',
      '    $candidate = if ($ext -and -not $baseName.ToLower().EndsWith($ext.ToLower())) { "$baseName$ext" } else { $baseName }',
      '    $target = Join-Path $targetDir $candidate',
      '    $idx = 2',
      '    while (Test-Path $target) {',
      '      $stem = [System.IO.Path]::GetFileNameWithoutExtension($candidate)',
      '      $fext = [System.IO.Path]::GetExtension($candidate)',
      '      $target = Join-Path $targetDir ("{0}_{1}{2}" -f $stem, $idx, $fext)',
      '      $idx++',
      '    }',
      '    [System.IO.File]::WriteAllBytes($target, $resp.Content)',
      '    Write-Host ("  Guardado -> " + [System.IO.Path]::GetFileName($target)) -ForegroundColor Green',
      '  } catch {',
      '    Write-Host "  Error en $baseName : $($_.Exception.Message)" -ForegroundColor Red',
      '  }',
      '}',
      '',
    ];

    for (const f of files) {
      const safeBase = sanitizeFsSegment(f.tableName).replace(/"/g, "'");
      const safeExt = (f.extension || '').replace(/"/g, '');
      const safeUrl = f.downloadUrl.replace(/"/g, '%22');
      const subDir = groupByPhase && f.phase ? sanitizeFsSegment(f.phase).replace(/"/g, "'") : '';
      lines.push(`Get-SercopFile "${safeUrl}" "${safeBase}" "${safeExt}" "${subDir}"`);
    }

    lines.push('', 'Write-Host "`nDescarga finalizada en: $destRoot" -ForegroundColor Cyan');
    return lines.join('\n');
  }

  // Bash script with curl + header inspection for original extension + deduplication
  const lines = [
    '#!/usr/bin/env bash',
    '# Script de descarga directa desde SERCOP (compraspublicas.gob.ec)',
    `DEST_ROOT="./${safeFolder.replace(/["$`\\]/g, '_')}"`,
    'mkdir -p "$DEST_ROOT"',
    '',
    'download_sercop() {',
    '  local url="$1"',
    '  local base="$2"',
    '  local known_ext="$3"',
    '  local subdir="$4"',
    '  local dir="$DEST_ROOT"',
    '  if [ -n "$subdir" ]; then dir="$DEST_ROOT/$subdir"; mkdir -p "$dir"; fi',
    '  local tmpfile hdrfile',
    '  tmpfile=$(mktemp)',
    '  hdrfile=$(mktemp)',
    '  if curl -fsSL -D "$hdrfile" -A "Mozilla/5.0" -e "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/ProcesoContratacion/tab.php" -o "$tmpfile" "$url"; then',
    '    local ext="$known_ext"',
    '    if [ -z "$ext" ]; then',
    '      ext=$(grep -i "^content-disposition:" "$hdrfile" | sed -n "s/.*filename[^=]*=[^\\\"]*\\\"\\?[^\\\"]*\\(\\.[A-Za-z0-9]\\{1,8\\}\\)\\\"\\?.*/\\1/ip" | tr "A-Z" "a-z" | head -n1)',
    '    fi',
    '    if [ -z "$ext" ]; then',
    '      local ct=$(grep -i "^content-type:" "$hdrfile" | awk "{print tolower(\\$2)}" | tr -d "\\r;" | head -n1)',
    '      case "$ct" in',
    '        application/pdf) ext=".pdf" ;;',
    '        application/zip|application/x-zip-compressed) ext=".zip" ;;',
    '        application/x-rar-compressed|application/vnd.rar) ext=".rar" ;;',
    '        application/msword) ext=".doc" ;;',
    '        application/vnd.openxmlformats-officedocument.wordprocessingml.document) ext=".docx" ;;',
    '        application/vnd.ms-excel) ext=".xls" ;;',
    '        application/vnd.openxmlformats-officedocument.spreadsheetml.sheet) ext=".xlsx" ;;',
    '      esac',
    '    fi',
    '    local fname="$base"',
    '    if [ -n "$ext" ] && [[ "${base,,}" != *"${ext,,}" ]]; then fname="${base}${ext}"; fi',
    '    local target="$dir/$fname"',
    '    local idx=2',
    '    while [ -e "$target" ]; do',
    '      target="$dir/${base}_${idx}${ext}"',
    '      idx=$((idx+1))',
    '    done',
    '    mv "$tmpfile" "$target"',
    '    echo "Guardado -> $target"',
    '  else',
    '    rm -f "$tmpfile"',
    '    echo "Error descargando: $base"',
    '  fi',
    '  rm -f "$hdrfile"',
    '}',
    '',
  ];

  for (const f of files) {
    const safeBase = sanitizeFsSegment(f.tableName).replace(/["$`\\]/g, '_');
    const safeExt = (f.extension || '').replace(/["$`\\]/g, '');
    const safeUrl = f.downloadUrl.replace(/'/g, "'\\''");
    const subDir = groupByPhase && f.phase ? sanitizeFsSegment(f.phase).replace(/["$`\\]/g, '_') : '';
    lines.push(`download_sercop '${safeUrl}' "${safeBase}" "${safeExt}" "${subDir}"`);
  }

  lines.push('', 'echo "Archivos guardados en $DEST_ROOT"');
  return lines.join('\n');
}
