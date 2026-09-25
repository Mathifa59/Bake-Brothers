import { ESTADOS_PEDIDO, puedeTransicionar, estadoLegible } from '@bakebrothers/domain'
import { formatoPrecio } from '../utils/formato'

// Presentacional — la lógica de fetch/cambio de estado vive en usePedidos,
// reusada por Pedidos.jsx y por el historial de un cliente en Clientes.jsx.
export default function TablaPedidos({ pedidos, guardando, onCambiarEstado }) {
  if (pedidos.length === 0) {
    return <p className="text-sm text-gris">No hay pedidos para este alcance todavía.</p>
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-borde/60 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-borde/60 bg-hueso text-xs font-bold uppercase tracking-wide text-gris">
          <tr>
            <th className="px-4 py-3">Número</th>
            <th className="px-4 py-3">Sede</th>
            <th className="px-4 py-3">Canal</th>
            <th className="px-4 py-3">Entrega</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.numero} className="border-b border-borde/40 last:border-0">
              <td className="px-4 py-3 font-semibold">
                <span className="flex items-center gap-2">
                  {p.numero}
                  {p.requiere_confirmar_combo && (
                    <span
                      title="El bot vendió un combo con sustitución — revisar antes de preparar."
                      className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-800"
                    >
                      Revisar combo
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3">{p.sedes?.nombre ?? <span className="text-gris">sin asignar</span>}</td>
              <td className="px-4 py-3 capitalize">{p.canal}</td>
              <td className="px-4 py-3 capitalize">{p.tipo_entrega}</td>
              <td className="px-4 py-3">{p.fecha_entrega}</td>
              <td className="px-4 py-3">{formatoPrecio(p.total)}</td>
              <td className="px-4 py-3">
                <select
                  value={p.estado}
                  disabled={guardando === p.numero}
                  onChange={(e) => onCambiarEstado(p.numero, p.estado, e.target.value)}
                  className="rounded-lg border border-borde bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-acento"
                >
                  <option value={p.estado}>{estadoLegible(p.estado, p.tipo_entrega)}</option>
                  {ESTADOS_PEDIDO.filter((e) => puedeTransicionar(p.estado, e)).map((e) => (
                    <option key={e} value={e}>
                      → {estadoLegible(e, p.tipo_entrega)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
