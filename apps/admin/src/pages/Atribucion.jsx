import { useEffect, useMemo, useState } from 'react'
import { cuentaComoIngreso, inicioDiaLima, sumarDiasISO } from '@bakebrothers/domain'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/datos'
import { formatoPrecio } from '../utils/formato'
import { Cargando, ErrorCarga, Portada, Tarjeta } from '../components/bakeos/ui'

const NOMBRE_CANAL = { web: 'Web', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', presencial: 'Presencial' }
const SIN_CAMPANA = 'Sin campaña'

const AGRUPACIONES = [
  { id: 'canal', etiqueta: 'Por canal' },
  { id: 'campana', etiqueta: 'Por campaña' },
]

export default function Atribucion() {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [agrupar, setAgrupar] = useState('canal')

  useEffect(() => {
    let cancelado = false
    setPedidos(null)
    setError(null)
    // El rango se interpreta en hora de Lima (el negocio opera ahí), no en la del navegador ni en UTC.
    traerTodo(() => {
      let q = supabase.from('orders').select('canal, campana, estado, total, creado_en').order('creado_en', { ascending: true })
      if (desde) q = q.gte('creado_en', inicioDiaLima(desde).toISOString())
      if (hasta) q = q.lt('creado_en', inicioDiaLima(sumarDiasISO(hasta, 1)).toISOString())
      return q
    })
      .then((filas) => !cancelado && setPedidos(filas))
      .catch((e) => !cancelado && setError(e.message ?? String(e)))
    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  const grupos = useMemo(() => {
    if (!pedidos) return []
    const mapa = new Map()
    for (const p of pedidos) {
      const clave = agrupar === 'canal' ? (NOMBRE_CANAL[p.canal] ?? p.canal) : (p.campana || SIN_CAMPANA)
      const g = mapa.get(clave) ?? { clave, pedidos: 0, ingresos: 0 }
      g.pedidos += 1
      if (cuentaComoIngreso(p.estado)) g.ingresos += Number(p.total)
      mapa.set(clave, g)
    }
    // "Sin campaña" siempre al final: lo interesante son las campañas con nombre.
    return [...mapa.values()].sort((a, b) => (a.clave === SIN_CAMPANA) - (b.clave === SIN_CAMPANA) || b.pedidos - a.pedidos)
  }, [pedidos, agrupar])

  const total = pedidos?.length ?? 0
  const conCampana = pedidos?.filter((p) => p.campana).length ?? 0

  return (
    <>
      <Portada titulo="Atribución" subtitulo="De dónde llegan los pedidos: canal y campaña" />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-xl border border-borde bg-hueso p-1" role="group" aria-label="Agrupar por">
          {AGRUPACIONES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAgrupar(a.id)}
              aria-pressed={agrupar === a.id}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${agrupar === a.id ? 'bg-tinta text-white' : 'text-gris hover:text-tinta'}`}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-borde bg-hueso px-3 py-2 text-sm outline-none focus:border-acento"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gris">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-borde bg-hueso px-3 py-2 text-sm outline-none focus:border-acento"
          />
        </div>
        {(desde || hasta) && (
          <button
            type="button"
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

      {error && <ErrorCarga mensaje={error} />}
      {!error && !pedidos && <Cargando />}

      {pedidos && (
        <>
          <p className="mt-4 text-sm text-gris">
            <strong className="text-tinta">{total}</strong> pedido{total === 1 ? '' : 's'} en el rango (ya filtrado por tu sede)
            {agrupar === 'campana' && total > 0 && (
              <>
                {' '}· <strong className="text-tinta">{conCampana}</strong> llegaron con una campaña
              </>
            )}
            .
          </p>

          {grupos.length === 0 ? (
            <p className="mt-4 text-sm text-gris">No hay pedidos en este rango.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grupos.map((g) => (
                <Tarjeta key={g.clave} className="p-5">
                  <p className="break-words text-xs font-bold uppercase tracking-wide text-gris">{g.clave}</p>
                  <p className="mt-1 text-3xl font-extrabold text-tinta">{g.pedidos}</p>
                  <p className="mt-1 text-xs text-gris">
                    pedido{g.pedidos === 1 ? '' : 's'} · {((g.pedidos / total) * 100).toFixed(0)}% del total
                  </p>
                  <p className="mt-2 text-sm font-semibold text-acento-oscuro">{formatoPrecio(g.ingresos)} en ventas</p>
                </Tarjeta>
              ))}
            </div>
          )}

          {agrupar === 'campana' && conCampana === 0 && total > 0 && (
            <p className="mt-4 rounded-xl bg-lila-suave/60 p-4 text-sm leading-relaxed">
              Todavía ningún pedido llegó con campaña. La referencia aparece cuando alguien entra a la web por un link con
              parámetros (por ejemplo <code className="text-xs">?utm_source=tiktok&amp;utm_campaign=halloween</code>) y
              escribe por WhatsApp desde ahí: el bot la lee del primer mensaje y la guarda en el pedido.
            </p>
          )}
        </>
      )}
    </>
  )
}
