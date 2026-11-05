import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { estadoLegible } from '@bakebrothers/domain'
import { supabase } from '../../lib/supabase'
import { formatoPrecio } from '../../utils/formato'
import { Pill } from '../bakeos/ui'

/**
 * Contexto de la conversación: datos del cliente y sus pedidos, con el pedido que el bot creó en este chat
 * arriba. Un pedido con pago reportado sin revisar se marca «Pago por revisar».
 */
export default function PanelContexto({ conversacion, cliente, alCargarPedidos }) {
  const [pedidos, setPedidos] = useState(null)

  useEffect(() => {
    let vivo = true
    setPedidos(null)
    const filtro = cliente?.id
      ? `customer_id.eq.${cliente.id},conversacion_id.eq.${conversacion.id}`
      : `conversacion_id.eq.${conversacion.id}`
    supabase
      .from('orders')
      .select('id, numero, estado, tipo_entrega, total, creado_en, conversacion_id, pago_reportado, pago_resultado')
      .or(filtro)
      .order('creado_en', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!vivo) return
        setPedidos(data ?? [])
        alCargarPedidos?.(data ?? [])
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id, cliente?.id, conversacion.ultimo_mensaje_en])

  const deEsteChat = (pedidos ?? []).filter((p) => p.conversacion_id === conversacion.id)
  const otros = (pedidos ?? []).filter((p) => p.conversacion_id !== conversacion.id)

  const Fila = ({ p, destacado }) => (
    <li className={`rounded-xl border p-3 text-sm ${destacado ? 'border-acento bg-acento-suave' : 'border-borde bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{p.numero}</span>
        <span className="font-semibold">{formatoPrecio(p.total)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Pill tono="neutro">{estadoLegible(p.estado, p.tipo_entrega)}</Pill>
        {p.pago_reportado && !p.pago_resultado && <Pill tono="prioridad">Pago por revisar</Pill>}
      </div>
    </li>
  )

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-borde bg-hueso p-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-gris">Cliente</p>
        <p className="mt-1 text-base font-semibold">{cliente?.nombre ?? 'Sin registrar todavía'}</p>
        <p className="text-sm text-gris">{conversacion.canal === 'whatsapp' ? `WhatsApp ${conversacion.external_id}` : conversacion.external_id}</p>
      </div>

      {pedidos === null ? (
        <p className="text-sm text-gris">Cargando pedidos…</p>
      ) : (
        <>
          {deEsteChat.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">Pedido de esta conversación</p>
              <ul className="flex flex-col gap-1.5">{deEsteChat.map((p) => <Fila key={p.id} p={p} destacado />)}</ul>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">Últimos pedidos</p>
            {otros.length === 0 ? (
              <p className="text-sm text-gris">Sin otros pedidos.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">{otros.map((p) => <Fila key={p.id} p={p} />)}</ul>
            )}
          </div>
          <Link to="/pedidos" className="text-xs font-semibold text-acento-oscuro">
            Ver todos los pedidos
          </Link>
        </>
      )}
    </div>
  )
}
