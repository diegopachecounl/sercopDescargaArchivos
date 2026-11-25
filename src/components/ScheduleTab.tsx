import type { SercopScheduleItem } from '../types/sercop';

interface ScheduleTabProps {
  schedule: SercopScheduleItem[];
}

export function ScheduleTab({ schedule }: ScheduleTabProps) {
  if (schedule.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Sin fechas de control</p>
          <p className="mt-1 text-xs text-slate-500">
            No se encontraron etapas de cronograma en el documento consultado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="w-3/4 px-4 py-2.5">Etapa</th>
              <th className="w-1/4 px-4 py-2.5">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {schedule.map((item, idx) => (
              <tr key={`${item.stage}-${idx}`} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5 text-slate-900">{item.stage}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{item.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
