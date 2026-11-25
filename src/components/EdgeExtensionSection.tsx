import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Loader2,
  Puzzle,
} from 'lucide-react';
import type { SercopProcessData } from '../types/sercop';

interface EdgeExtensionSectionProps {
  onLoadReferenceSample: () => Promise<SercopProcessData | null>;
}

type SimulatorScenario = 'sercop' | 'non-sercop';

export function EdgeExtensionSection({
  onLoadReferenceSample,
}: EdgeExtensionSectionProps) {
  const [scenario, setScenario] = useState<SimulatorScenario>('sercop');
  const [simData, setSimData] = useState<SercopProcessData | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const handleLoadSim = async () => {
    setScenario('sercop');
    if (simData) return;
    setSimLoading(true);
    const data = await onLoadReferenceSample();
    if (data) setSimData(data);
    setSimLoading(false);
  };

  return (
    <section className="space-y-6">
      {/* Header & Download Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
              <Puzzle className="h-4 w-4" />
              <span>Extensión Microsoft Edge (Manifest V3)</span>
            </div>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-slate-900">
              Consulta y descarga directamente desde tu navegador Edge
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Al abrir la extensión sobre una pestaña de <span className="font-mono text-xs">compraspublicas.gob.ec</span>, lee el parámetro <span className="font-mono text-xs">idSoliCompra</span> de la URL activa, consulta directamente <span className="font-mono text-xs">tab.php?tab=6</span> con tu conexión local y guarda los archivos seleccionados conservando el nombre de la tabla y su extensión original. Si la pestaña activa no pertenece al SERCOP, muestra un mensaje de error claro.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href="/api/extension/download-zip"
              download="sercop-edge-extension.zip"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Download className="h-4 w-4" />
              <span>Descargar Extensión Edge (.zip)</span>
            </a>
          </div>
        </div>

        {/* 4-step Edge Installation Instructions */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4 border-t border-slate-200 pt-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-semibold text-slate-900">01. Descargar y descomprimir</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Descarga <span className="font-mono">sercop-edge-extension.zip</span> y extráelo en una carpeta permanente de tu equipo (o usa la carpeta <span className="font-mono">edge-extension/</span> del proyecto).
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-semibold text-slate-900">02. Abrir edge://extensions</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              En Microsoft Edge, escribe <span className="font-mono">edge://extensions</span> en la barra de direcciones y activa el interruptor <strong>Modo de desarrollador</strong>.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-semibold text-slate-900">03. Cargar descomprimida</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Haz clic en <strong>Cargar descomprimida</strong> y selecciona la carpeta extraída que contiene <span className="font-mono">manifest.json</span>.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-semibold text-slate-900">04. Abrir en cualquier proceso</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Navega a una ficha del SERCOP en Edge, haz clic en el ícono de la extensión y guarda en <span className="font-mono">Descargas/SERCOP</span> o en cualquier carpeta del disco.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Extension Popup Preview */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Vista previa del comportamiento de la extensión
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Comprueba cómo responde el popup al leer la URL de la pestaña activa en Edge.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
            <button
              type="button"
              onClick={handleLoadSim}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scenario === 'sercop'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pestaña en SERCOP
            </button>
            <button
              type="button"
              onClick={() => setScenario('non-sercop')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scenario === 'non-sercop'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pestaña externa (Error)
            </button>
          </div>
        </div>

        {/* Simulated Edge Browser Toolbar + Popup Frame */}
        <div className="mt-5 rounded-lg border border-slate-300 bg-slate-100 p-4">
          <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="font-mono truncate">
              {scenario === 'sercop'
                ? 'https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=GUBoheupwWsaRg_0wVaqhRLv5az0PbGyPXkFrwRJynA,'
                : 'https://www.google.com/search?q=ejemplo'}
            </span>
          </div>

          <div className="mx-auto max-w-[780px] overflow-hidden rounded-lg border border-slate-300 bg-slate-50 shadow-sm">
            {scenario === 'non-sercop' ? (
              <div className="p-6">
                <div className="rounded-lg border border-slate-200 bg-white p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 font-bold text-red-700">
                      !
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        La pestaña activa no corresponde al SERCOP
                      </h4>
                      <p className="mt-1 text-xs text-slate-600">
                        La URL de la pestaña activa no corresponde al portal SERCOP (compraspublicas.gob.ec).
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 break-all">
                    https://www.google.com/search?q=ejemplo
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Abre un proceso en <span className="font-mono">compraspublicas.gob.ec</span> (por ejemplo, <span className="font-mono">informacionProcesoContratacion2.cpe?idSoliCompra=...</span>) y vuelve a abrir esta extensión.
                  </p>
                </div>
              </div>
            ) : simLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-700" />
                <p className="mt-2 text-xs font-medium text-slate-700">
                  Cargando vista previa de SIE-EEASA-121-2023...
                </p>
              </div>
            ) : simData ? (
              <div>
                <div className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-sm font-bold text-slate-900">
                        {simData.processCode}
                      </span>
                      <span className="text-xs text-slate-500">Pestaña activa · SERCOP</span>
                    </div>
                    <p className="text-xs text-slate-600">{simData.entityName}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
                      <ExternalLink className="h-3 w-3" />
                      tab=6
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white">
                        <Download className="h-3.5 w-3.5" />
                        Descargar en Descargas ({simData.files.length})
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                        <FolderOpen className="h-3.5 w-3.5" />
                        Elegir carpeta del disco...
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {simData.files.length} archivos listos
                    </span>
                  </div>
                  <div className="overflow-hidden rounded border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Descripción en tabla</th>
                          <th className="px-3 py-2">Fase / Sección</th>
                          <th className="px-3 py-2">Razón Social / Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {simData.files.slice(0, 5).map((f) => (
                          <tr key={f.id}>
                            <td className="px-3 py-2 font-mono text-slate-500">{f.index}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{f.tableName}</td>
                            <td className="px-3 py-2 text-slate-600">{f.phase}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">
                              {f.date || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-slate-600">
                  Haz clic abajo para previsualizar el popup con los 88 archivos reales del proceso <span className="font-mono font-semibold">SIE-EEASA-121-2023</span>.
                </p>
                <button
                  type="button"
                  onClick={handleLoadSim}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <AlertCircle className="h-3.5 w-3.5 hidden" />
                  <span>Cargar vista previa del popup (88 archivos)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
