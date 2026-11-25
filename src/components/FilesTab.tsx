import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Download,
  FileCode2,
  FolderOpen,
  Loader2,
  Search,
  Terminal,
} from 'lucide-react';
import type { FileDownloadStatus, SercopFileItem } from '../types/sercop';
import {
  downloadFilesAsZip,
  downloadFilesToFolder,
  fetchSercopFileBlob,
  generateDownloadScript,
  isFileSystemAccessSupported,
  isInsideIframe,
  pickLocalDirectory,
  sanitizeFsSegment,
  saveBlobToDirectory,
  triggerBlobDownload,
  type DirectoryHandleLike,
} from '../utils/fileSystem';

interface FilesTabProps {
  files: SercopFileItem[];
  processCode: string;
  filesTabUrl: string;
  onOpenManualImport?: () => void;
}

type ExtCategory = 'all' | 'pdf' | 'excel' | 'word' | 'archive' | 'other';

function getExtCategory(ext: string): ExtCategory {
  const clean = ext.toLowerCase().replace(/^\./, '');
  if (clean === 'pdf') return 'pdf';
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(clean)) return 'excel';
  if (['doc', 'docx', 'rtf', 'odt', 'txt'].includes(clean)) return 'word';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(clean)) return 'archive';
  return 'other';
}

export function FilesTab({
  files,
  processCode,
  filesTabUrl,
  onOpenManualImport,
}: FilesTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(files.map((f) => f.id))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [extFilter, setExtFilter] = useState<ExtCategory>('all');
  const [dirHandle, setDirHandle] = useState<DirectoryHandleLike | null>(null);
  const [createSubfolder, setCreateSubfolder] = useState(true);
  const [groupByPhase, setGroupByPhase] = useState(false);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<
    Record<string, { state: FileDownloadStatus; resolvedName?: string; error?: string }>
  >({});
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<string | null>(null);
  const [scriptPreview, setScriptPreview] = useState<{
    format: 'powershell' | 'bash';
    code: string;
  } | null>(null);

  const fsSupported = isFileSystemAccessSupported();
  const inIframe = isInsideIframe();

  const distinctPhases = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const f of files) {
      if (f.phase && !seen.has(f.phase)) {
        seen.add(f.phase);
        list.push(f.phase);
      }
    }
    return list;
  }, [files]);

  const hasKnownExtensions = useMemo(
    () => files.some((f) => Boolean(f.extension)),
    [files]
  );

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((file) => {
      if (phaseFilter !== 'all' && file.phase !== phaseFilter) {
        return false;
      }
      if (extFilter !== 'all' && getExtCategory(file.extension) !== extFilter) {
        return false;
      }
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
  }, [files, searchQuery, phaseFilter, extFilter]);

  const selectedFiles = useMemo(
    () => files.filter((f) => selectedIds.has(f.id)),
    [files, selectedIds]
  );

  const allFilteredSelected =
    filteredFiles.length > 0 && filteredFiles.every((f) => selectedIds.has(f.id));

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredFiles.forEach((f) => next.delete(f.id));
      } else {
        filteredFiles.forEach((f) => next.add(f.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateFileStatus = (
    fileId: string,
    state: FileDownloadStatus,
    resolvedName?: string,
    error?: string
  ) => {
    setStatuses((prev) => ({
      ...prev,
      [fileId]: { state, resolvedName, error },
    }));
  };

  const handleChooseFolder = async (): Promise<DirectoryHandleLike | null> => {
    setFolderNotice(null);
    const result = await pickLocalDirectory();
    if (result.handle) {
      setDirHandle(result.handle);
      return result.handle;
    }
    if (result.error) {
      setFolderNotice(result.error);
    }
    return null;
  };

  const handleSaveToFolder = async () => {
    if (selectedFiles.length === 0 || isBatchRunning) return;
    setBatchSummary(null);

    let activeDir = dirHandle;
    if (!activeDir) {
      activeDir = await handleChooseFolder();
      if (!activeDir) return;
    }

    setIsBatchRunning(true);
    const subfolder = createSubfolder ? sanitizeFsSegment(processCode) : null;
    const result = await downloadFilesToFolder(
      selectedFiles,
      activeDir,
      subfolder,
      groupByPhase,
      updateFileStatus
    );
    setIsBatchRunning(false);

    const targetLabel = subfolder ? `${activeDir.name}/${subfolder}` : activeDir.name;
    setBatchSummary(
      `Finalizado: ${result.saved} archivo(s) guardados en "${targetLabel}"${
        result.failed > 0 ? `, ${result.failed} con error` : ''
      }.`
    );
  };

  const handleDownloadZip = async () => {
    if (selectedFiles.length === 0 || isBatchRunning) return;
    setBatchSummary(null);
    setIsBatchRunning(true);

    const zipName = `${sanitizeFsSegment(processCode)}_archivos.zip`;
    const result = await downloadFilesAsZip(
      selectedFiles,
      zipName,
      groupByPhase,
      updateFileStatus
    );

    setIsBatchRunning(false);
    setBatchSummary(
      result.saved > 0
        ? `Paquete ZIP generado (${result.saved} archivo(s))${
            result.failed > 0 ? `, ${result.failed} con error` : ''
          }.`
        : 'No se pudo descargar ninguno de los archivos seleccionados desde el servidor.'
    );
  };

  const handleSingleDownload = async (file: SercopFileItem) => {
    updateFileStatus(file.id, 'downloading');
    try {
      const { blob, resolvedFilename } = await fetchSercopFileBlob(file);
      if (dirHandle) {
        const segments: string[] = [];
        if (createSubfolder) segments.push(sanitizeFsSegment(processCode));
        if (groupByPhase && file.phase) segments.push(file.phase);
        await saveBlobToDirectory(dirHandle, segments, resolvedFilename, blob);
      } else {
        triggerBlobDownload(resolvedFilename, blob);
      }
      updateFileStatus(file.id, 'saved', resolvedFilename);
    } catch (err) {
      updateFileStatus(
        file.id,
        'error',
        undefined,
        err instanceof Error ? err.message : 'Error al descargar'
      );
    }
  };

  const handleGenerateScript = (format: 'powershell' | 'bash') => {
    const targetFiles = selectedFiles.length > 0 ? selectedFiles : files;
    if (targetFiles.length === 0) return;
    const code = generateDownloadScript(targetFiles, format, processCode, groupByPhase);
    setScriptPreview({ format, code });
  };

  const handleDownloadScriptFile = () => {
    if (!scriptPreview) return;
    const ext = scriptPreview.format === 'powershell' ? 'ps1' : 'sh';
    const filename = `descargar_${sanitizeFsSegment(processCode)}.${ext}`;
    triggerBlobDownload(
      filename,
      new Blob([scriptPreview.code], { type: 'text/plain;charset=utf-8' })
    );
  };

  const completedCount = selectedFiles.filter(
    (f) => statuses[f.id]?.state === 'saved'
  ).length;

  if (files.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">Sin archivos disponibles</p>
          <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-600">
            No se encontraron enlaces de archivos descargables en la tabla consultada. Puedes verificar directamente la pestaña de archivos en SERCOP o importar el HTML de <span className="font-mono">tab.php?tab=6</span> manualmente.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href={filesTabUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <span>Abrir tab=6 en SERCOP</span>
            </a>
            {onOpenManualImport && (
              <button
                type="button"
                onClick={onOpenManualImport}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span>Pegar / Subir HTML de tab=6</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Local folder & batch action bar */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleChooseFolder}
                disabled={isBatchRunning}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <FolderOpen className="h-4 w-4 text-blue-700" />
                <span>{dirHandle ? 'Cambiar carpeta local' : 'Elegir carpeta local'}</span>
              </button>

              {dirHandle ? (
                <span className="text-xs font-medium text-slate-700">
                  Destino:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {dirHandle.name}
                    {createSubfolder ? `/${sanitizeFsSegment(processCode)}` : ''}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  {fsSupported && !inIframe
                    ? 'Selecciona una carpeta de tu equipo para guardar los archivos directamente.'
                    : 'En vista embebida o navegadores sin acceso directo a carpetas, usa Descargar ZIP o Script local.'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {dirHandle && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createSubfolder}
                    onChange={(e) => setCreateSubfolder(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    Subcarpeta del proceso ({sanitizeFsSegment(processCode)})
                  </span>
                </label>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={groupByPhase}
                  onChange={(e) => setGroupByPhase(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Organizar en subcarpetas por fase</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {fsSupported && (
              <button
                type="button"
                onClick={handleSaveToFolder}
                disabled={selectedFiles.length === 0 || isBatchRunning}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {isBatchRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                <span>Guardar en carpeta ({selectedFiles.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={selectedFiles.length === 0 || isBatchRunning}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Archive className="h-4 w-4 text-slate-600" />
              <span>Descargar ZIP ({selectedFiles.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateScript('powershell')}
              disabled={selectedFiles.length === 0}
              title="Generar script PowerShell para descargar directamente desde tu PC a una carpeta local"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Terminal className="h-3.5 w-3.5 text-slate-500" />
              <span>Script .ps1</span>
            </button>

            <button
              type="button"
              onClick={() => handleGenerateScript('bash')}
              disabled={selectedFiles.length === 0}
              title="Generar script Bash (curl) para Linux/macOS"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Terminal className="h-3.5 w-3.5 text-slate-500" />
              <span>Script .sh</span>
            </button>
          </div>
        </div>

        {folderNotice && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{folderNotice}</span>
          </div>
        )}

        {batchSummary && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800">
            <span className="font-medium">{batchSummary}</span>
            {isBatchRunning && (
              <span className="font-mono text-slate-500">
                {completedCount}/{selectedFiles.length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Script preview drawer */}
      {scriptPreview && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display text-xs font-semibold text-slate-900">
                {scriptPreview.format === 'powershell'
                  ? 'Script PowerShell para descarga local directa desde tu equipo'
                  : 'Script Bash (curl) para descarga local directa desde tu terminal'}
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Ejecútalo en la carpeta donde deseas guardar los archivos; resuelve automáticamente la extensión original desde SERCOP y evita sobrescribir nombres repetidos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadScriptFile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>
                  Descargar .{scriptPreview.format === 'powershell' ? 'ps1' : 'sh'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(scriptPreview.code)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Copiar
              </button>
              <button
                type="button"
                onClick={() => setScriptPreview(null)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
          <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
            {scriptPreview.code}
          </pre>
        </div>
      )}

      {/* Search, Phase Filter & Extension Filter bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por archivo, razón social, usuario o fase..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {distinctPhases.length > 1 && (
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              aria-label="Filtrar por fase del proceso"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none max-w-xs"
            >
              <option value="all">Todas las fases ({files.length})</option>
              {distinctPhases.map((phase) => (
                <option key={phase} value={phase}>
                  {phase}
                </option>
              ))}
            </select>
          )}
        </div>

        {hasKnownExtensions && (
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'pdf', label: 'PDF' },
                { id: 'excel', label: 'Excel' },
                { id: 'word', label: 'Word' },
                { id: 'archive', label: 'ZIP/RAR' },
                { id: 'other', label: 'Otros' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setExtFilter(cat.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  extFilter === cat.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* High-density file selection table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="w-10 px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  aria-label="Seleccionar todos los archivos visibles"
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
              </th>
              <th className="w-12 px-2 py-2.5 text-right font-mono">#</th>
              <th className="px-4 py-2.5">Descripción y archivo resultante</th>
              <th className="px-4 py-2.5">Fase / Sección</th>
              <th className="px-4 py-2.5">Razón Social / Fecha</th>
              <th className="px-4 py-2.5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredFiles.map((file) => {
              const checked = selectedIds.has(file.id);
              const statusInfo = statuses[file.id];
              const displayFinalName =
                statusInfo?.resolvedName || file.suggestedFilename;

              return (
                <tr
                  key={file.id}
                  className={`transition-colors ${
                    checked ? 'bg-blue-50/35 hover:bg-blue-50/55' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="px-3 py-2.5 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(file.id)}
                      aria-label={`Seleccionar ${file.tableName}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs text-slate-500 align-middle">
                    {file.index}
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <div className="font-medium text-slate-900">{file.tableName}</div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500 break-all">
                      {displayFinalName}
                      {file.size ? ` · ${file.size}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700 align-middle max-w-[230px]">
                    {file.phase}
                  </td>
                  <td className="px-4 py-2.5 text-xs align-middle max-w-[240px]">
                    {file.uploadedByEntity ? (
                      <div className="font-medium text-slate-800 truncate" title={file.uploadedByEntity}>
                        {file.uploadedByEntity}
                      </div>
                    ) : null}
                    <div className="font-mono text-xs text-slate-500 whitespace-nowrap">
                      {file.date || '—'}
                      {file.uploadedByUser ? ` · ${file.uploadedByUser}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSingleDownload(file)}
                        disabled={statusInfo?.state === 'downloading'}
                        title={`Descargar ${displayFinalName}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Descargar</span>
                      </button>
                      <a
                        href={file.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir enlace original en SERCOP"
                        className="text-xs font-medium text-slate-500 hover:text-blue-700 hover:underline"
                      >
                        Origen
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="tabular-nums">
          Mostrando {filteredFiles.length} de {files.length} archivos · {selectedFiles.length} seleccionados
        </span>
        <span>
          Los nombres respetan la tabla de consulta junto con su extensión original resuelta al descargar.
        </span>
      </div>
    </div>
  );
}
