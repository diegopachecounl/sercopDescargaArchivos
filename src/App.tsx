import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Clock,
  FileCode2,
  Files,
  Info,
  Loader2,
  Package,
  Search,
  Users,
} from 'lucide-react';
import { EdgeExtensionSection } from './components/EdgeExtensionSection';
import { FilesTab } from './components/FilesTab';
import { ManualHtmlPanel } from './components/ManualHtmlPanel';
import { ParticipantsTab } from './components/ParticipantsTab';
import { ProcessHeader } from './components/ProcessHeader';
import { ProcessInfoTab } from './components/ProcessInfoTab';
import { ProductsTab } from './components/ProductsTab';
import { ScheduleTab } from './components/ScheduleTab';
import type {
  SercopInspectErrorResponse,
  SercopProcessData,
  SercopTabId,
} from './types/sercop';

const EXAMPLE_SERCOP_URL =
  'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=GUBoheupwWsaRg_0wVaqhRLv5az0PbGyPXkFrwRJynA,';

const HISTORY_STORAGE_KEY = 'sercop_recent_queries_v1';

interface QueryHistoryEntry {
  url: string;
  code: string;
  entity: string;
  timestamp: string;
}

export default function App() {
  const [urlInput, setUrlInput] = useState(EXAMPLE_SERCOP_URL);
  const [activeSection, setActiveSection] = useState<'extension' | 'consulta' | 'importar' | 'guia'>('extension');
  const [activeTab, setActiveTab] = useState<SercopTabId>('archivos');
  const [isLoading, setIsLoading] = useState(false);
  const [processData, setProcessData] = useState<SercopProcessData | null>(null);
  const [inspectError, setInspectError] = useState<SercopInspectErrorResponse | null>(null);
  const [showManualImport, setShowManualImport] = useState(false);
  const [recentQueries, setRecentQueries] = useState<QueryHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as QueryHistoryEntry[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(recentQueries.slice(0, 6)));
    } catch {
      // ignore storage quota errors
    }
  }, [recentQueries]);

  const recordHistory = (data: SercopProcessData, queriedUrl: string) => {
    const entry: QueryHistoryEntry = {
      url: queriedUrl || data.processUrl,
      code: data.processCode,
      entity: data.entityName,
      timestamp: data.fetchedAt,
    };
    setRecentQueries((prev) => {
      const filtered = prev.filter((item) => item.url !== entry.url);
      return [entry, ...filtered].slice(0, 6);
    });
  };

  const runInspect = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setInspectError(null);
    setActiveSection('consulta');

    try {
      const res = await fetch('/api/sercop/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errPayload = data as SercopInspectErrorResponse;
        setInspectError(errPayload);
        if (errPayload.code === 'SERCOP_TIMEOUT' || errPayload.code === 'SERCOP_BLOCKED') {
          setShowManualImport(true);
        }
        return;
      }

      const parsed = data as SercopProcessData;
      setProcessData(parsed);
      setShowManualImport(false);
      setActiveTab(parsed.files.length > 0 ? 'archivos' : 'info');
      recordHistory(parsed, trimmed);
    } catch {
      setInspectError({
        code: 'SERCOP_HTTP_ERROR',
        error: 'No se pudo comunicar con el servidor local de consulta.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runInspect(urlInput);
  };

  const handleParseManualHtml = async (payload: {
    html: string;
    processHtml?: string;
    sourceUrl?: string;
  }) => {
    setIsLoading(true);
    setInspectError(null);
    try {
      const res = await fetch('/api/sercop/parse-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setInspectError({
          code: 'PARSE_ERROR',
          error: data.error || 'No se pudo analizar el HTML proporcionado.',
        });
        return;
      }
      const parsed = data as SercopProcessData;
      setProcessData(parsed);
      setShowManualImport(false);
      setActiveSection('consulta');
      setActiveTab(parsed.files.length > 0 ? 'archivos' : 'info');
      if (payload.sourceUrl) {
        recordHistory(parsed, payload.sourceUrl);
      }
    } catch {
      setInspectError({
        code: 'PARSE_ERROR',
        error: 'Error al procesar el HTML importado.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadAttachedExample = async () => {
    setIsLoading(true);
    setInspectError(null);
    try {
      const [infoRes, filesRes] = await Promise.all([
        fetch('/assets/aistudio/ejemplo_descarga_e0dff370.txt'),
        fetch('/assets/aistudio/Paste_November_23__2026_-_3_35PM_68928518'),
      ]);
      if (!filesRes.ok) {
        throw new Error('No se encontró el archivo HTML de tab=6 de ejemplo.');
      }
      const filesHtml = await filesRes.text();
      const infoHtml = infoRes.ok ? await infoRes.text() : '';
      await handleParseManualHtml({
        html: filesHtml,
        processHtml: infoHtml || undefined,
        sourceUrl:
          'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/ProcesoContratacion/tab.php?tab=6&id=GUBoheupwWsaRg_0wVaqhRLv5az0PbGyPXkFrwRJynA,',
      });
    } catch {
      setInspectError({
        code: 'PARSE_ERROR',
        error: 'No se pudo cargar la respuesta HTML de ejemplo.',
      });
      setIsLoading(false);
    }
  };

  const fetchReferenceSampleData = async (): Promise<SercopProcessData | null> => {
    try {
      const [infoRes, filesRes] = await Promise.all([
        fetch('/assets/aistudio/ejemplo_descarga_e0dff370.txt'),
        fetch('/assets/aistudio/Paste_November_23__2026_-_3_35PM_68928518'),
      ]);
      if (!filesRes.ok) return null;
      const filesHtml = await filesRes.text();
      const infoHtml = infoRes.ok ? await infoRes.text() : '';
      const res = await fetch('/api/sercop/parse-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: filesHtml,
          processHtml: infoHtml || undefined,
          sourceUrl:
            'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/ProcesoContratacion/tab.php?tab=6&id=GUBoheupwWsaRg_0wVaqhRLv5az0PbGyPXkFrwRJynA,',
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as SercopProcessData;
    } catch {
      return null;
    }
  };

  const handleReset = () => {
    setProcessData(null);
    setInspectError(null);
    setShowManualImport(false);
    setActiveSection('consulta');
  };

  const tabs: Array<{
    id: SercopTabId;
    label: string;
    count?: number;
    icon: typeof Info;
  }> = [
    { id: 'info', label: 'Información del Proceso', icon: Info },
    {
      id: 'participantes',
      label: 'Participantes',
      count: processData?.participants.length,
      icon: Users,
    },
    {
      id: 'productos',
      label: 'Productos',
      count: processData?.products.length,
      icon: Package,
    },
    {
      id: 'archivos',
      label: 'Archivos',
      count: processData?.files.length,
      icon: Files,
    },
    {
      id: 'cronograma',
      label: 'Cronograma',
      count: processData?.schedule.length,
      icon: Calendar,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={handleReset}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            SERCOP Descarga de Archivos
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveSection('extension')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                activeSection === 'extension'
                  ? 'text-slate-900 underline decoration-blue-700 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Extensión Edge
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('consulta')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                activeSection === 'consulta'
                  ? 'text-slate-900 underline decoration-blue-700 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Consulta web
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('importar');
                setShowManualImport(true);
              }}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                activeSection === 'importar'
                  ? 'text-slate-900 underline decoration-blue-700 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Importar HTML
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('guia')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                activeSection === 'guia'
                  ? 'text-slate-900 underline decoration-blue-700 decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Cómo funciona
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <a
              href="/api/extension/download-zip"
              download="sercop-edge-extension.zip"
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Descargar Extensión
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8 space-y-6">
        {activeSection === 'extension' && (
          <EdgeExtensionSection onLoadReferenceSample={fetchReferenceSampleData} />
        )}

        {/* URL Query Bar */}
        {activeSection !== 'extension' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Consulta y descarga de archivos del proceso SERCOP
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Pega la URL de la ficha del proceso (<span className="font-mono text-xs">informacionProcesoContratacion2.cpe</span>), el enlace directo a <span className="font-mono text-xs">tab.php?tab=6</span> o el código <span className="font-mono text-xs">idSoliCompra</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualImport((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline self-start sm:self-auto whitespace-nowrap shrink-0"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span>{showManualImport ? 'Ocultar importación HTML' : 'Importar HTML manualmente'}</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=..."
                aria-label="URL del proceso SERCOP"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none sm:text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !urlInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Consultando...</span>
                </>
              ) : (
                <>
                  <span>Consultar archivos</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setUrlInput(EXAMPLE_SERCOP_URL)}
              className="font-medium text-slate-700 hover:text-blue-700 hover:underline"
            >
              Usar URL de ejemplo
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleLoadAttachedExample}
              className="font-medium text-slate-700 hover:text-blue-700 hover:underline"
            >
              Cargar plantilla de referencia (SIE-EEASA-121-2023)
            </button>
            {recentQueries.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Recientes:</span>
                </span>
                {recentQueries.slice(0, 3).map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => {
                      setUrlInput(item.url);
                      runInspect(item.url);
                    }}
                    className="font-mono text-xs text-blue-700 hover:underline"
                  >
                    {item.code}
                  </button>
                ))}
              </>
            )}
          </div>
        </section>
        )}

        {/* Inspect Error / Cloud Geoblock Notice */}
        {inspectError && activeSection !== 'extension' && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="flex-1 space-y-2">
                <h2 className="font-display text-sm font-semibold text-amber-950">
                  No se pudo obtener la respuesta directa desde SERCOP
                </h2>
                <p className="text-sm text-amber-900">
                  {inspectError.error} El portal <span className="font-mono text-xs">compraspublicas.gob.ec</span> suele restringir o agotar el tiempo de espera para servidores en la nube fuera de Ecuador.
                </p>
                {inspectError.filesTabUrl && (
                  <div className="pt-1 flex flex-wrap items-center gap-3 text-xs">
                    <a
                      href={inspectError.filesTabUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-800 underline"
                    >
                      Abrir tab.php?tab=6 directamente en tu navegador
                    </a>
                    <span className="text-amber-400" aria-hidden="true">·</span>
                    <span className="text-amber-900">
                      Copia el HTML de esa pestaña y pégalo en el panel de abajo para extraer todos los archivos.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Manual HTML Import Panel */}
        {(showManualImport || activeSection === 'importar') && activeSection !== 'extension' && (
          <ManualHtmlPanel
            defaultSourceUrl={inspectError?.filesTabUrl || urlInput}
            filesTabUrl={inspectError?.filesTabUrl || processData?.filesTabUrl}
            processUrl={inspectError?.processUrl || processData?.processUrl}
            errorMessage={inspectError?.error}
            isParsing={isLoading}
            onParseHtml={handleParseManualHtml}
            onClose={() => {
              setShowManualImport(false);
              setActiveSection('consulta');
            }}
          />
        )}

        {/* Guide Section */}
        {activeSection === 'guia' && (
          <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Guía rápida de uso y preservación de nombres
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 text-sm text-slate-600">
              <div>
                <h3 className="font-semibold text-slate-900">01. Consulta automática de tab=6</h3>
                <p className="mt-1.5 leading-relaxed">
                  Al ingresar una URL de <span className="font-mono text-xs">informacionProcesoContratacion2.cpe?idSoliCompra=...</span>, la aplicación extrae el identificador y consulta automáticamente su tabla de archivos en <span className="font-mono text-xs">tab.php?tab=6&amp;id=...</span>.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">02. Nombres y extensiones originales</h3>
                <p className="mt-1.5 leading-relaxed">
                  Cada archivo conserva el nombre exacto listado en la tabla del proceso junto con su extensión original (<span className="font-mono text-xs">.pdf</span>, <span className="font-mono text-xs">.xlsx</span>, <span className="font-mono text-xs">.docx</span>, <span className="font-mono text-xs">.zip</span>, etc.), evitando duplicados.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">03. Guardado en carpeta local</h3>
                <p className="mt-1.5 leading-relaxed">
                  Marca únicamente los documentos que necesitas y elige una carpeta de tu equipo, descarga un paquete ZIP unificado o genera un script local <span className="font-mono text-xs">.ps1</span> / <span className="font-mono text-xs">.sh</span>.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Loading Skeleton matching the 5-tab layout */}
        {isLoading && activeSection !== 'extension' && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4 space-y-2 animate-pulse">
              <div className="h-6 w-52 rounded bg-slate-200" />
              <div className="h-4 w-80 rounded bg-slate-100" />
            </div>
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 flex gap-4 animate-pulse">
              <div className="h-4 w-36 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
            </div>
            <div className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="h-11 w-full rounded bg-slate-100" />
              ))}
            </div>
          </section>
        )}

        {/* 5-Tab Process Detail Panel matching ejemplo descarga.txt */}
        {!isLoading && processData && activeSection !== 'extension' && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <ProcessHeader
              processCode={processData.processCode}
              entityName={processData.entityName}
              sourceMode={processData.sourceMode}
              processUrl={processData.processUrl}
              filesTabUrl={processData.filesTabUrl}
              isRefreshing={isLoading}
              onRefresh={() => runInspect(urlInput || processData.processUrl)}
              onClose={handleReset}
            />

            {/* PrimeFaces-inspired horizontal tab bar */}
            <div
              role="tablist"
              aria-label="Secciones del proceso SERCOP"
              className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/70 px-4"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
                      isActive
                        ? 'border-blue-700 bg-white text-blue-800'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span className="font-mono text-xs text-slate-500">
                        ({tab.count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Tab Panel */}
            <div role="tabpanel">
              {activeTab === 'info' && (
                <ProcessInfoTab
                  fields={processData.infoFields}
                  processUrl={processData.processUrl}
                  filesTabUrl={processData.filesTabUrl}
                />
              )}
              {activeTab === 'participantes' && (
                <ParticipantsTab participants={processData.participants} />
              )}
              {activeTab === 'productos' && (
                <ProductsTab products={processData.products} />
              )}
              {activeTab === 'archivos' && (
                <FilesTab
                  key={`${processData.idSoliCompra}-${processData.fetchedAt}`}
                  files={processData.files}
                  processCode={processData.processCode}
                  filesTabUrl={processData.filesTabUrl}
                  onOpenManualImport={() => setShowManualImport(true)}
                />
              )}
              {activeTab === 'cronograma' && (
                <ScheduleTab schedule={processData.schedule} />
              )}
            </div>
          </section>
        )}

        {/* Initial Empty State */}
        {!isLoading && !processData && !showManualImport && activeSection === 'consulta' && (
          <section className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Listo para consultar un proceso del SERCOP
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
              Ingresa arriba la URL del proceso y presiona <span className="font-semibold text-slate-800">Consultar archivos</span> para inspeccionar las pestañas del proceso, elegir qué documentos descargar y guardarlos en tu carpeta local con su nombre y extensión original.
            </p>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs text-slate-500">
          <span>SERCOP Descarga de Archivos · Asistente para procesos públicos</span>
          <span>Preserva el nombre de la tabla de consulta y su extensión original</span>
        </div>
      </footer>
    </div>
  );
}
