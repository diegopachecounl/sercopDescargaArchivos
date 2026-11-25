import type { SercopParticipant } from '../types/sercop';

interface ParticipantsTabProps {
  participants: SercopParticipant[];
}

export function ParticipantsTab({ participants }: ParticipantsTabProps) {
  if (participants.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Sin participantes</p>
          <p className="mt-1 text-xs text-slate-500">
            Este proceso no reporta participantes en el documento consultado.
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
              <th className="px-4 py-2.5">Participante</th>
              <th className="px-4 py-2.5">RUC</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5 text-right">Valor Publicado</th>
              <th className="px-4 py-2.5 text-right">Propuesta Final</th>
              <th className="px-4 py-2.5 text-right">Variación</th>
              <th className="px-4 py-2.5 text-right"># Propuestas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {participants.map((p, idx) => (
              <tr key={`${p.ruc}-${idx}`} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.ruc}</td>
                <td className="px-4 py-2.5 text-slate-700">{p.status}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                  {p.publishedValue}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-slate-900">
                  {p.finalOffer}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                  {p.variation}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                  {p.proposalsCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
