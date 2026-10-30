import { Fragment } from 'react'
import { ESTADOS_PEDIDO, puedeTransicionar, estadoLegible } from '@bakebrothers/domain'
import { formatoPrecio } from '../utils/formato'
import { Pill } from './bakeos/ui'

// Presentacional — la lógica de fetch/cambio de estado vive en usePedidos,
// reusada por Pedidos.jsx y por el historial de un cliente en Clientes.jsx.
// Celular: una tarjeta por pedido. Pantalla ancha: la tabla de siempre.

function SelectorEstado({ pedido, guardando, onCambiarEstado, bloqueado }) {
  return (
    <select
      value={pedido.estado}
      disabled={guardando === pedido.numero || bloqueado}
      title={bloqueado ? 'Tómalo primero con "Me lo quedo" para cambiar su estado.' : undefined}
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

// Un delivery del bot nace sin sede (ambas sedes despachan) y lo ven todas; la sede que lo toma se lo queda.
function SinSede({ pedido, perfil, guardando, onTomar }) {
  if (pedido.sede_id) return null
  const puedeTomar = Boolean(perfil?.sedeId && onTomar)
  return (
    <>
      <Pill tono="lila" title="Delivery sin sede: lo ven todas las sedes hasta que una lo toma.">
        Sin sede
      </Pill>
      {puedeTomar && (
        <button
          type="button"
          onClick={() => onTomar(pedido.numero)}
          disabled={guardando === pedido.numero}
          className="rounded-lg bg-tinta px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Me lo quedo
        </button>
      )}
    </>
  )
}

// Pago que el cliente reportó con una captura (el bot la leyó): la persona lo confirma o lo rechaza con un toque.
// El bot nunca lo da por confirmado. Si los datos leídos no cuadran con el pedido, va marcado "Revisar" con el motivo.
function PagoReportado({ pedido, guardando, bloqueado, onConfirmar, onRechazar }) {
  const r = pedido.pago_reportado
  if (pedido.estado !== 'payment_pending' || !r) return null

  if (pedido.pago_resultado === 'rechazado') {
    return (
      <Pill tono="neutro" title="Rechazaste el pago reportado. Si el cliente manda otra captura, vuelve a aparecer para revisar.">
        Pago rechazado · esperando otra captura
      </Pill>
    )
  }
  if (pedido.pago_resultado) return null

  const datos = [
    r.monto != null ? formatoPrecio(r.monto) : 'monto no leído',
    r.fecha ?? 'fecha no leída',
    r.numeroOperacion ? `Op. ${r.numeroOperacion}` : 'sin n.° de operación',
    r.medio ?? null,
  ].filter(Boolean)
  const ocupado = guardando === pedido.numero || bloqueado
  return (
    <div className="mt-2 w-full rounded-xl border border-borde bg-lila-suave/50 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tono="lila">Pago reportado</Pill>
        {r.requiereRevision && <Pill tono="prioridad">Revisar</Pill>}
        <span className="text-xs font-semibold">{datos.join(' · ')}</span>
      </div>
      {r.requiereRevision && Array.isArray(r.motivos) && (
        <ul className="mt-1.5 list-disc pl-5 text-xs text-acento-oscuro">
          {r.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onConfirmar(pedido.numero)}
          disabled={ocupado}
          title={bloqueado ? 'Tómalo primero con "Me lo quedo".' : undefined}
          className="rounded-lg bg-tinta px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Confirmar pago
        </button>
        <button
          type="button"
          onClick={() => onRechazar(pedido.numero)}
          disabled={ocupado}
          className="rounded-lg border border-borde bg-hueso px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    </div>
  )
}

// Un operador no puede cambiar el estado de un pedido sin sede hasta tomarlo (lo exige la RLS, 0035).
const estadoBloqueado = (pedido, perfil) => !pedido.sede_id && perfil?.rol !== 'admin'

function EtiquetaCombo({ pedido }) {
  if (!pedido.requiere_confirmar_combo) return null
  return (
    <Pill tono="prioridad" title="El bot vendió un combo con sustitución — revisar antes de preparar.">
      Revisar combo
    </Pill>
  )
}

export default function TablaPedidos({ pedidos, guardando, onCambiarEstado, onTomar, onConfirmarPago, onRechazarPago, perfil }) {
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
              <SelectorEstado pedido={p} guardando={guardando} onCambiarEstado={onCambiarEstado} bloqueado={estadoBloqueado(p, perfil)} />
              <EtiquetaCombo pedido={p} />
              <SinSede pedido={p} perfil={perfil} guardando={guardando} onTomar={onTomar} />
            </div>
            {onConfirmarPago && (
              <PagoReportado
                pedido={p}
                guardando={guardando}
                bloqueado={estadoBloqueado(p, perfil)}
                onConfirmar={onConfirmarPago}
                onRechazar={onRechazarPago}
              />
            )}
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
              <Fragment key={p.numero}>
              <tr className="border-b border-borde/60 last:border-0">
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
                  <span className="flex flex-wrap items-center gap-2">
                    <SelectorEstado pedido={p} guardando={guardando} onCambiarEstado={onCambiarEstado} bloqueado={estadoBloqueado(p, perfil)} />
                    <SinSede pedido={p} perfil={perfil} guardando={guardando} onTomar={onTomar} />
                  </span>
                </td>
              </tr>
              {onConfirmarPago && p.estado === 'payment_pending' && p.pago_reportado && (
                <tr className="border-b border-borde/60 last:border-0">
                  <td colSpan={8} className="px-4 pb-3">
                    <PagoReportado
                      pedido={p}
                      guardando={guardando}
                      bloqueado={estadoBloqueado(p, perfil)}
                      onConfirmar={onConfirmarPago}
                      onRechazar={onRechazarPago}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
