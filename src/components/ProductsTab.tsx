import type { SercopProduct } from '../types/sercop';

interface ProductsTabProps {
  products: SercopProduct[];
}

export function ProductsTab({ products }: ProductsTabProps) {
  if (products.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Sin productos registrados</p>
          <p className="mt-1 text-xs text-slate-500">
            No se detectaron ítems de productos o CPC en esta consulta.
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
              <th className="px-4 py-2.5">CPC</th>
              <th className="px-4 py-2.5">Descripción CPC</th>
              <th className="px-4 py-2.5">Descripción Producto</th>
              <th className="px-4 py-2.5 text-right">Cantidad</th>
              <th className="px-4 py-2.5">Unidad</th>
              <th className="px-4 py-2.5 text-right">P. Unitario</th>
              <th className="px-4 py-2.5 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {products.map((prod, idx) => (
              <tr key={`${prod.cpc}-${idx}`} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{prod.cpc}</td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{prod.cpcDescription}</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{prod.productDescription}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                  {prod.quantity}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{prod.unit}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                  {prod.unitPrice}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-slate-900">
                  {prod.subtotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
