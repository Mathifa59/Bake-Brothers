import { ESTADOS_PEDIDO, puedeTransicionar, estadoLegible } from '@bakebrothers/domain'
import { formatoPrecio } from '../utils/formato'
import { Pill } from './bakeos/ui'

// Presentacional — la lógica de fetch/cambio de estado vive en usePedidos,
// reusada por Pedidos.jsx y por el historial de un cliente en Clientes.jsx.
// Celular: una tarjeta por pedido. Pantalla ancha: la tabla de siempre.

function SelectorEstado({ pedido, guardando, onCambiarEstado }) {
  return (
    <select
      value={pedido.estado}
      disabled={guardando === pedido.numero}
      onChange={(e) => onCambiarEstado(pedido.numero, pedido.estado, e.target.value)}
      aria-label={`Estado del pedido ${pedido.numero}`}
      className="rounded-lg border border-borde bg-hueso px-2 py-1.5 text-xs font-semibold outline-none focus:border-acento"
    >
      <option value={pedido.estado}>{estadoLegible(pedido.estado, pedido.tipo_entrega)}</option>
      {ESTADOS_PEDIDO.filter((e) => puedeTransicionar(pedido.estado, e)).map((e) => (
        <option key={e} value={e}>
          → {estadoLegible(e, pedido.tipo_entrega)}
        </option>
      ))}
    </select>
  )
}

function EtiquetaCombo({ pedido }) {
  if (!pedido.requiere_confirmar_combo) return null
  return (
    <Pill tono="prioridad" title="El bot vendió un combo con sustitución — revisar antes de preparar.">
      Revisar combo
    </Pill>
  )
}

export default function TablaPedidos({ pedidos, guardando, onCambiarEstado }) {
  if (pedidos.length === 0) {
    return <p className="text-sm text-gris">No hay pedidos para este alcance todavía.</p>
  }
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {pedidos.map((p) => (
          <li key={p.numero} className="rounded-xl border border-borde bg-hueso p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{p.numero}</p>
                <p className="text-xs text-gris">{p.customers?.nombre ?? 'Sin cliente'}</p>
              </div>
              <span className="text-sm font-semibold">{formatoPrecio(p.total)}</span>
            </div>
            <p className="mt-1 text-xs capitalize text-gris">
              {p.fecha_entrega} · {p.horario_entrega} · {p.tipo_entrega} · {p.canal}
              {p.sedes?.nombre ? ` · ${p.sedes.nombre}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SelectorEstado pedido={p} guardando={guardando} onCambiarEstado={onCambiarEstado} />
              <EtiquetaCombo pedido={p} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-borde bg-hueso md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-borde bg-crema text-xs font-bold uppercase tracking-wide text-gris">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
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
              <tr key={p.numero} className="border-b border-borde/60 last:border-0">
                <td className="px-4 py-3 font-semibold">
                  <span className="flex items-center gap-2">
                    {p.numero}
                    <EtiquetaCombo pedido={p} />
                  </span>
                </td>
                <td className="px-4 py-3">{p.customers?.nombre ?? <span className="text-gris">—</span>}</td>
                <td className="px-4 py-3">{p.sedes?.nombre ?? <span className="text-gris">sin asignar</span>}</td>
                <td className="px-4 py-3 capitalize">{p.canal}</td>
                <td className="px-4 py-3 capitalize">{p.tipo_entrega}</td>
                <td className="px-4 py-3">{p.fecha_entrega}</td>
                <td className="px-4 py-3">{formatoPrecio(p.total)}</td>
                <td className="px-4 py-3">
                  <SelectorEstado pedido={p} guardando={guardando} onCambiarEstado={onCambiarEstado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
