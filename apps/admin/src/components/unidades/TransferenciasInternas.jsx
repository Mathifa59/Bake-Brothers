import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reporteUnidades } from '../../lib/unidadesApi'
import { formatoSoles } from '../../utils/unidades'

/**
 * Métricas muestra SOLO la venta al público. Lo que sale para la calle y los mayoristas son transferencias internas a
 * precio interno: no son ventas y no se suman acá. Este bloque lo explica (para que nadie crea que bajaron las ventas) y
 * muestra cuánto fue en el mismo rango, aparte.
 */
export default function TransferenciasInternas({ desde, hasta }) {
  const [unidades, setUnidades] = useState(null)

  useEffect(() => {
    let cancelado = false
    setUnidades(null)
    reporteUnidades({ desde, hasta })
      .then((d) => !cancelado && setUnidades(d.unidades))
      .catch(() => !cancelado && setUnidades([]))
    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  return (
    <div className="mb-6 space-y-3">
      <p role="note" className="rounded-2xl border border-caramelo/40 bg-caramelo-suave/40 p-4 text-sm text-gris">
        <b className="text-tinta">Estas cifras son solo ventas al público.</b> Desde ahora las órdenes de mayoristas ya no cuentan como venta (antes se sumaban como pedidos de S/ 0 y
        bajaban el ticket promedio): son transferencias internas a precio interno y se ven aparte, abajo y en Unidades. Si te parece que los pedidos bajaron, es por este cambio de
        medición, no porque se haya vendido menos.
      </p>
      {unidades && unidades.length > 0 && (
        <div className="rounded-2xl border border-borde/60 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Transferencias internas (no son ventas)</h2>
            <Link to="/unidades" className="text-xs font-semibold text-acento-oscuro underline">
              Ver Unidades
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {unidades.map((u) => (
              <li key={u.unidadId} className="rounded-xl bg-borde/40 p-3">
                <p className="text-sm font-bold">{u.nombre}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">{formatoSoles(u.totales.valor)}</p>
                <p className="text-xs text-gris">
                  {u.totales.cantidad} unidades a precio interno
                  {u.totales.lineasSinPrecio > 0 ? ` · ${u.totales.lineasSinPrecio} sin precio` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
