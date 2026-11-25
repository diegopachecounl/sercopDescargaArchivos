import { useState, type ChangeEvent } from 'react';
import { Copy, ExternalLink, FileCode2, Upload, Check } from 'lucide-react';

interface ManualHtmlPanelProps {
  defaultSourceUrl: string;
  filesTabUrl?: string;
  processUrl?: string;
  errorMessage?: string | null;
  isParsing: boolean;
  onParseHtml: (payload: { html: string; processHtml?: string; sourceUrl?: string }) => void;
  onClose?: () => void;
}

const CONSOLE_SNIPPET = `copy(document.documentElement.outerHTML);`;

export function ManualHtmlPanel({
  defaultSourceUrl,
  filesTabUrl,
  processUrl,
  errorMessage,
  isParsing,
  onParseHtml,
  onClose,
}: ManualHtmlPanelProps) {
  const [filesHtml, setFilesHtml] = useState('');
  const [processHtml, setProcessHtml] = useState('');
  const [sourceUrl, setSourceUrl] = useState(defaultSourceUrl);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFilesHtml(text);
  };

  const handleCopySnippet = () => {
    navigator.clipboard?.writeText(CONSOLE_SNIPPET);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900">
            Importar HTML directo desde tu navegador (Modo local SERCOP)
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Si el portal SERCOP bloquea o limita conexiones desde servidores en la nube, abre la pestaña de archivos en tu propio navegador, copia su HTML y pégalo aquí para listar y descargar los documentos con sus nombres y extensiones originales.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 self-start whitespace-nowrap shrink-0"
          >
            Ocultar panel
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">Motivo de consulta directa: </span>
          {errorMessage}
        </div>
      )}

      {/* Step-by-step quick guide */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold text-slate-900">
            01. Abrir pestaña de archivos
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Abre el enlace <span className="font-mono">tab=6</span> en tu navegador conectado a Ecuador.
          </p>
          {filesTabUrl && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={filesTabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-slate-50"
              >
                <span>Abrir tab=6</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {processUrl && (
                <a
                  href={processUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <span>Abrir Ficha</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold text-slate-900">
            02. Copiar código fuente HTML
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Presiona <span className="font-mono">Ctrl+U</span> (Ver código fuente) o ejecuta en la consola (<span className="font-mono">F12</span>):
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5">
            <code className="font-mono text-xs text-slate-800 truncate">{CONSOLE_SNIPPET}</code>
            <button
              type="button"
              onClick={handleCopySnippet}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 shrink-0"
            >
              {copiedSnippet ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedSnippet ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold text-slate-900">
            03. Pegar o subir archivo .html
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            También puedes guardar la página (<span className="font-mono">Ctrl+S</span>) y cargar el archivo <span className="font-mono">.html</span> aquí.
          </p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>Cargar archivo .html / .txt</span>
            <input
              type="file"
              accept=".html,.htm,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Textarea inputs */}
      <div className="mt-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700">
            URL de referencia del proceso (opcional, para completar enlaces relativos)
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/ProcesoContratacion/tab.php?tab=6&id=..."
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">
            HTML de la pestaña de Archivos (tab=6) o del detalle del proceso
          </label>
          <textarea
            rows={6}
            value={filesHtml}
            onChange={(e) => setFilesHtml(e.target.value)}
            placeholder="Pega aquí el código HTML de la página tab.php?tab=6&id=... o del detalle del proceso..."
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <details className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">
            Opcional: Pegar también el HTML de la ficha principal (informacionProcesoContratacion2.cpe)
          </summary>
          <textarea
            rows={4}
            value={processHtml}
            onChange={(e) => setProcessHtml(e.target.value)}
            placeholder="Pega aquí el HTML de informacionProcesoContratacion2.cpe si deseas extraer también código, entidad, productos y fechas..."
            className="mt-2.5 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </details>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={!filesHtml.trim() || isParsing}
            onClick={() =>
              onParseHtml({
                html: filesHtml,
                processHtml: processHtml.trim() || undefined,
                sourceUrl: sourceUrl.trim() || undefined,
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FileCode2 className="h-4 w-4" />
            <span>{isParsing ? 'Analizando HTML...' : 'Extraer archivos del HTML'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
