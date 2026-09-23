import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePedidos } from '../hooks/usePedidos'
import TablaPedidos from '../components/TablaPedidos'

export default function Clientes() {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState(null)
  const [seleccionado, setSeleccionado] = useState(null) // { id, nombre }
  // customer_id -> fecha ISO del pedido más reciente. Consulta agregada
  // sobre orders (misma tabla/RLS que ya usa usePedidos, sin tocar el
  // esquema) — no un campo nuevo en customers.
  const [ultimoPedidoPorCliente, setUltimoPedidoPorCliente] = useState({})

  useEffect(() => {
    supabase
      .from('customers')
      .select('id, nombre, telefono')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setClientes(data)
      })

    supabase
      .from('orders')
      .select('customer_id, creado_en')
      .order('creado_en', { ascending: false })
      .then(({ data, error }) => {
        if (error) return // no bloquea la pantalla — la columna queda vacía si falla
        const porCliente = {}
        for (const { customer_id, creado_en } of data) {
          // Ya viene ordenado por creado_en desc, así que la primera
          // ocurrencia por cliente es la más reciente.
          if (!porCliente[customer_id]) porCliente[customer_id] = creado_en
        }
        setUltimoPedidoPorCliente(porCliente)
      })
  }, [])

  const { pedidos, error: errorPedidos, guardando, cambiarEstado } = usePedidos({
    customerId: seleccionado?.id,
  })

  if (error) return <p className="p-6 text-sm text-red-600">Error al cargar clientes: {error}</p>
  if (!clientes) return <p className="p-6 text-sm text-gris">Cargando clientes…</p>

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-bold">Clientes</h1>
      {clientes.length === 0 ? (
        <p className="text-sm text-gris">No hay clientes para tu alcance todavía.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-borde/60 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borde/60 bg-hueso text-xs font-bold uppercase tracking-wide text-gris">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3">Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSeleccionado(c)}
                    className={`cursor-pointer border-b border-borde/40 last:border-0 transition-colors hover:bg-hueso ${
                      seleccionado?.id === c.id ? 'bg-acento-suave' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold">{c.nombre}</td>
                    <td className="px-4 py-3">{c.telefono}</td>
                    <td className="px-4 py-3 text-gris">
                      {ultimoPedidoPorCliente[c.id]
                        ? new Date(ultimoPedidoPorCliente[c.id]).toLocaleDateString('es-PE')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            {!seleccionado ? (
              <p className="text-sm text-gris">Elegí un cliente para ver su historial de pedidos.</p>
            ) : (
              <>
                <h2 className="mb-3 text-sm font-bold text-gris">Pedidos de {seleccionado.nombre}</h2>
                {errorPedidos ? (
                  <p className="text-sm text-red-600">Error al cargar pedidos: {errorPedidos}</p>
                ) : !pedidos ? (
                  <p className="text-sm text-gris">Cargando…</p>
                ) : (
                  <TablaPedidos pedidos={pedidos} guardando={guardando} onCambiarEstado={cambiarEstado} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
