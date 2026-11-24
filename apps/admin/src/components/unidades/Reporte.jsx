import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { sumarDiasISO } from '@bakebrothers/domain'
import { anularPago, mensajeDeErrorUnidades, registrarPago, reporteUnidades } from '../../lib/unidadesApi'
import { diaLegible, formatoSoles, hoyLima } from '../../utils/unidades'
import { Cargando, ErrorCarga, Pill, Tarjeta } from '../bakeos/ui'
import { Campo, claseEntrada, Hoja, MensajeError } from '../equipo/campos'

const PRESETS = [
  ['hoy', 'Hoy'],
  ['semana', '7 días'],
  ['mes', '30 días'],
]
const rangoDe = (preset) => {
  const hoy = hoyLima()
  if (preset === 'hoy') return { desde: hoy, hasta: hoy }
  if (preset === 'semana') return { desde: sumarDiasISO(hoy, -6), hasta: hoy }
  return { desde: sumarDiasISO(hoy, -29), hasta: hoy }
}

function HojaPago({ unidades, unidadInicial, onCerrar, onHecho }) {
  const [unidadId, setUnidadId] = useState(unidadInicial ?? unidades[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoyLima())
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const guardar = async () => {
    const n = Number(String(monto).replace(',', '.'))
    if (!(n > 0)) return setError('Escribe el monto que pagó.')
    setEnviando(true)
    setError(null)
    try {
      await registrarPago({ unidadId, fecha, monto: n, nota: nota.trim() || null })
      onHecho()
      onCerrar()
    } catch (err) {
      setError(mensajeDeErrorUnidades(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Hoja
      titulo="Registrar un pago"
      onCerrar={onCerrar}
      aviso={<MensajeError texto={error} />}
      pie={
        <button type="button" onClick={guardar} disabled={enviando} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Guardar pago'}
        </button>
      }
    >
      <p className="text-sm text-gris">Lo que una unidad le pagó a Bake. Baja el saldo de ese día. No calcula porcentajes ni sueldos.</p>
      <Campo etiqueta="Unidad" htmlFor="pago-unidad">
        <select id="pago-unidad" value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className={claseEntrada}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha del pago" htmlFor="pago-fecha">
          <input id="pago-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Monto (S/)" htmlFor="pago-monto">
          <input id="pago-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={claseEntrada} />
        </Campo>
      </div>
      <Campo etiqueta="Nota (opcional)" htmlFor="pago-nota">
        <input id="pago-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Efectivo, Yape…" className={claseEntrada} />
      </Campo>
    </Hoja>
  )
}

/** Valor a precio interno, pagos y saldo de cada unidad, por día. Sin porcentajes ni sueldos. */
export default function Reporte({ unidades }) {
  const [preset, setPreset] = useState('semana')
  const [personalizado, setPersonalizado] = useState(null) // { desde, hasta } | null
  const [unidadId, setUnidadId] = useState('')
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null })
  const [pagando, setPagando] = useState(null) // unidadId
  const [errorAccion, setErrorAccion] = useState(null)
  const rango = personalizado ?? rangoDe(preset)

  const cargar = useCallback(async () => {
    try {
      const datos = await reporteUnidades({ desde: rango.desde, hasta: rango.hasta, unidadId })
      setEstado({ cargando: false, datos, error: null })
    } catch (err) {
      setEstado({ cargando: false, datos: null, error: mensajeDeErrorUnidades(err) })
    }
  }, [rango.desde, rango.hasta, unidadId])

  useEffect(() => {
    setEstado((e) => ({ ...e, cargando: true }))
    cargar()
  }, [cargar])

  const anular = async (id) => {
    setErrorAccion(null)
    try {
      await anularPago(id)
      await cargar()
    } catch (err) {
      setErrorAccion(mensajeDeErrorUnidades(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([id, texto]) => (
          <button
            key={id}
            type="button"
            aria-pressed={!personalizado && preset === id}
            onClick={() => {
              setPersonalizado(null)
              setPreset(id)
            }}
            className={`h-11 rounded-full px-4 text-sm font-semibold ${!personalizado && preset === id ? 'bg-tinta text-white' : 'bg-borde/60 text-gris'}`}
          >
            {texto}
          </button>
        ))}
        <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} aria-label="Unidad" className="h-11 w-full min-w-0 basis-full rounded-xl border border-borde bg-hueso px-3 text-sm font-semibold outline-none focus:border-acento sm:basis-0 sm:flex-1">
          <option value="">Todas las unidades</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Desde
          <input type="date" value={rango.desde} max={rango.hasta} onChange={(e) => setPersonalizado({ desde: e.target.value, hasta: rango.hasta })} className="h-11 rounded-xl border border-borde bg-hueso px-3 text-sm font-normal text-tinta outline-none focus:border-acento" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gris">
          Hasta
          <input type="date" value={rango.hasta} min={rango.desde} onChange={(e) => setPersonalizado({ desde: rango.desde, hasta: e.target.value })} className="h-11 rounded-xl border border-borde bg-hueso px-3 text-sm font-normal text-tinta outline-none focus:border-acento" />
        </label>
      </div>

      <p role="note" className="rounded-xl bg-acento-suave p-3 text-xs text-acento-oscuro">
        Estos montos son <b>transferencias internas a precio interno</b>: no son ventas al público y no entran a Métricas. El saldo es lo valorizado menos lo que la unidad ya pagó.
      </p>

      <MensajeError texto={errorAccion} />
      {estado.cargando && <Cargando texto="Calculando…" />}
      {estado.error && <ErrorCarga mensaje={estado.error} />}

      {estado.datos?.unidades.map((u) => (
        <Tarjeta key={u.unidadId} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">{u.nombre}</h3>
              <p className="text-xs text-gris">
                {u.saldoAnterior !== 0 ? `Saldo antes de ${diaLegible(rango.desde)}: ${formatoSoles(u.saldoAnterior)}` : 'Sin saldo anterior'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-gris">Saldo al {diaLegible(rango.hasta)}</p>
              <p className="text-xl font-bold tabular-nums">{formatoSoles(u.saldoFinal)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Valorizado', formatoSoles(u.totales.valor)],
              ['Pagos', formatoSoles(u.totales.pagos)],
              ['Unidades', u.totales.cantidad],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="rounded-xl bg-borde/40 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gris">{etiqueta}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">{valor}</p>
              </div>
            ))}
          </div>

          {u.totales.lineasSinPrecio > 0 && (
            <p role="status" className="rounded-xl bg-acento-suave px-3 py-2 text-xs text-acento-oscuro">
              {u.totales.lineasSinPrecio} línea{u.totales.lineasSinPrecio === 1 ? '' : 's'} sin precio interno: se cuentan pero todavía no suman al valor. Se valoran cuando cargues el precio en la pestaña Precios.
            </p>
          )}

          {u.dias.length === 0 ? (
            <p className="rounded-xl bg-borde/40 px-3.5 py-3 text-sm text-gris">Sin movimientos en estas fechas.</p>
          ) : (
            <ul className="divide-y divide-borde/60">
              {[...u.dias].reverse().map((d) => (
                <li key={d.fecha} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold">{diaLegible(d.fecha)}</p>
                    <p className="text-sm font-bold tabular-nums">{formatoSoles(d.saldoDia)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-gris">
                    {d.cantidad} unidades · valor {formatoSoles(d.valor)} · pagos {formatoSoles(d.pagos)}
                    {d.lineasSinPrecio > 0 ? ` · ${d.lineasSinPrecio} sin precio` : ''}
                  </p>
                  <p className="text-[11px] text-gris">Acumulado: {formatoSoles(d.saldoAcumulado)}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t border-borde pt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold">Pagos</h4>
              <button type="button" onClick={() => setPagando(u.unidadId)} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-borde bg-white px-3 text-sm font-semibold">
                <Plus size={15} aria-hidden="true" />
                Registrar pago
              </button>
            </div>
            {u.pagos.length === 0 ? (
              <p className="text-xs text-gris">Sin pagos en estas fechas.</p>
            ) : (
              <ul className="space-y-1.5">
                {u.pagos.map((p) => (
                  <li key={p.id} className={`flex items-center gap-2 text-sm ${p.anulado ? 'opacity-50 line-through' : ''}`}>
                    <span className="min-w-0 flex-1 truncate">
                      {diaLegible(p.fecha)} · {formatoSoles(p.monto)}
                      {p.nota ? ` · ${p.nota}` : ''}
                    </span>
                    {p.anulado ? (
                      <Pill>Anulado</Pill>
                    ) : (
                      <button type="button" onClick={() => anular(p.id)} className="min-h-11 shrink-0 px-2 text-xs font-semibold text-red-700 underline">
                        Anular
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Tarjeta>
      ))}

      {pagando && <HojaPago unidades={unidades} unidadInicial={pagando} onCerrar={() => setPagando(null)} onHecho={cargar} />}
    </div>
  )
}
