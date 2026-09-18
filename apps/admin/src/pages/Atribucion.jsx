import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const NOMBRE_CANAL = { web: 'Web', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram' }

export default function Atribucion() {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    let query = supabase.from('orders').select('canal, creado_en').limit(1000)
    if (desde) query = query.gte('creado_en', desde)
    if (hasta) query = query.lte('creado_en', `${hasta}T23:59:59`)
    query.then(({ data, error }) => {
      if (error) setError(error.message)
      else setPedidos(data)
    })
  }, [desde, hasta])

  const porCanal = useMemo(() => {
    if (!pedidos) return []
    const conteo = new Map()
    for (const p of pedidos) conteo.set(p.canal, (conteo.get(p.canal) ?? 0) + 1)
    return [...conteo.entries()].sort((a, b) => b[1] - a[1])
  }, [pedidos])

  const total = pedidos?.length ?? 0

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-bold">Atribución por canal</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
          />
        </div>
        {(desde || hasta) && (
          <button
            onClick={() => {
              setDesde('')
              setHasta('')
            }}
            className="rounded-lg border border-borde px-3 py-2 text-xs font-bold text-gris hover:bg-hueso"
          >
            Limpiar
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}
      {!error && !pedidos && <p className="text-sm text-gris">Cargando…</p>}

      {pedidos && (
        <>
          <p className="mb-4 text-sm text-gris">
            <strong className="text-tinta">{total}</strong> pedido{total === 1 ? '' : 's'} en el rango
            {' '}(alcance ya filtrado por tu sede).
          </p>
          {porCanal.length === 0 ? (
            <p className="text-sm text-gris">No hay pedidos en este rango.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {porCanal.map(([canal, cantidad]) => (
                <div key={canal} className="rounded-2xl border border-borde/60 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-gris">
                    {NOMBRE_CANAL[canal] ?? canal}
                  </p>
                  <p className="mt-1 text-3xl font-extrabold text-tinta">{cantidad}</p>
                  <p className="mt-1 text-xs text-gris">{((cantidad / total) * 100).toFixed(0)}% del total</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
