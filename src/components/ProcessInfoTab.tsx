import { ExternalLink } from 'lucide-react';
import type { SercopInfoField } from '../types/sercop';

interface ProcessInfoTabProps {
  fields: SercopInfoField[];
  processUrl: string;
  filesTabUrl: string;
}

export function ProcessInfoTab({ fields, processUrl, filesTabUrl }: ProcessInfoTabProps) {
  if (fields.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-6">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Información del Proceso
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            No se encontraron campos detallados en la ficha HTML consultada. Puedes abrir los enlaces directos del proceso o revisar la pestaña Archivos.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={processUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
            >
              <span>Ver proceso completo en SERCOP</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <a
              href={filesTabUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
            >
              <span>Abrir pestaña tab=6 (Archivos)</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="font-display text-sm font-semibold text-slate-900">
        Información del Proceso
      </h3>

      <dl className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {fields.map((field, idx) => (
          <div
            key={`${field.label}-${idx}`}
            className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[220px_1fr] sm:gap-6"
          >
            <dt className="text-xs font-medium text-slate-500 sm:text-sm">
              {field.label}
            </dt>
            <dd
              className={`text-sm break-words ${
                field.accent ? 'font-semibold text-blue-700' : 'text-slate-900'
              }`}
            >
              {field.isLink && field.href ? (
                <a
                  href={field.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"
                >
                  <span>{field.value}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="tabular-nums">{field.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
