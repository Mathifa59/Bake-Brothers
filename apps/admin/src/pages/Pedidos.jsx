import { useEffect, useState } from 'react'
import { ESTADOS_PEDIDO, puedeTransicionar, estadoLegible } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { formatoPrecio } from '../utils/formato'

export default function Pedidos() {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(null) // numero en vuelo, para deshabilitar su select

  const cargar = () => {
    setError(null)
    supabase
      .from('orders')
      .select('numero, canal, tipo_entrega, fecha_entrega, horario_entrega, estado, total, sede_id, creado_en, sedes(nombre)')
      .order('creado_en', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setPedidos(data)
      })
  }

  useEffect(cargar, [])

  const cambiarEstado = async (numero, estadoActual, nuevoEstado) => {
    if (nuevoEstado === estadoActual) return
    setGuardando(numero)
    const { error, data } = await supabase
      .from('orders')
      .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
      .eq('numero', numero)
      .select('numero')
    setGuardando(null)
    if (error) {
      alert(`No se pudo actualizar ${numero}: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      // RLS bloqueó la fila (no es de tu sede) sin lanzar error — PostgREST
      // simplemente no devuelve nada. Se distingue de un error real.
      alert(`No tenés permiso para editar el pedido ${numero} (no es de tu sede).`)
      return
    }
    cargar()
  }

  if (error) return <p className="p-6 text-sm text-red-600">Error al cargar pedidos: {error}</p>
  if (!pedidos) return <p className="p-6 text-sm text-gris">Cargando pedidos…</p>

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-bold">Pedidos</h1>
      {pedidos.length === 0 ? (
        <p className="text-sm text-gris">No hay pedidos para tu alcance todavía.</p>
      ) : (
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
                  <td className="px-4 py-3 font-semibold">{p.numero}</td>
                  <td className="px-4 py-3">{p.sedes?.nombre ?? <span className="text-gris">sin asignar</span>}</td>
                  <td className="px-4 py-3 capitalize">{p.canal}</td>
                  <td className="px-4 py-3 capitalize">{p.tipo_entrega}</td>
                  <td className="px-4 py-3">{p.fecha_entrega}</td>
                  <td className="px-4 py-3">{formatoPrecio(p.total)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={p.estado}
                      disabled={guardando === p.numero}
                      onChange={(e) => cambiarEstado(p.numero, p.estado, e.target.value)}
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
      )}
    </div>
  )
}
