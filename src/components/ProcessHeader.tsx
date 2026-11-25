import { ExternalLink, RefreshCw, X } from 'lucide-react';

interface ProcessHeaderProps {
  processCode: string;
  entityName: string;
  sourceMode: 'live-sercop' | 'manual-html';
  processUrl: string;
  filesTabUrl: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

export function ProcessHeader({
  processCode,
  entityName,
  sourceMode,
  processUrl,
  filesTabUrl,
  isRefreshing,
  onRefresh,
  onClose,
}: ProcessHeaderProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {processCode}
            </h2>
            <span className="text-xs font-medium text-slate-500">
              {sourceMode === 'live-sercop' ? 'Consulta en línea SERCOP' : 'Importado desde HTML local'}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {entityName}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={filesTabUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir pestaña de archivos (tab=6) en SERCOP"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            <span>Ver tab=6</span>
          </a>

          <a
            href={processUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir ficha completa del proceso en SERCOP"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            <span>Ficha SERCOP</span>
          </a>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Actualizar consulta"
            aria-label="Actualizar consulta"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Cerrar detalle"
            aria-label="Cerrar detalle"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
