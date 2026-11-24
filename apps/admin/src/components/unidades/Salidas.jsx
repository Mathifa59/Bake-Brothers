import { useCallback, useEffect, useMemo, useState } from 'react'
import { PackageCheck, Plus, Undo2 } from 'lucide-react'
import { sumarDiasISO } from '@bakebrothers/domain'
import { anularSalida, listarSalidas, mensajeDeErrorUnidades } from '../../lib/unidadesApi'
import { diaLegible, formatoSoles, hoyLima, mananaLima } from '../../utils/unidades'
import { Cargando, ErrorCarga, Pill, Tarjeta } from '../bakeos/ui'
import { MensajeError } from '../equipo/campos'
import { HojaDevolucion, HojaSalida, HojaSalio } from './HojasSalida'

const ESTADOS = {
  planificada: { texto: 'Planificada', tono: 'prioridad' },
  salio: { texto: 'Salió', tono: 'ok' },
  anulada: { texto: 'Anulada', tono: 'neutro' },
}

/** «Salida a calle»: planificar el día anterior, confirmar lo que salió y anotar lo que volvió. */
export default function Salidas({ unidades, sedes, skus, esAdmin }) {
  const [estado, setEstado] = useState({ cargando: true, salidas: [], error: null })
  const [filtro, setFiltro] = useState('proximas') // proximas | recientes
  const [accionError, setAccionError] = useState(null)
  const [hoja, setHoja] = useState(null) // { tipo: 'nueva' | 'editar' | 'salio' | 'devolucion', salida? }

  const cargar = useCallback(async () => {
    const hoy = hoyLima()
    try {
      const d = await listarSalidas(filtro === 'proximas' ? { desde: hoy, hasta: sumarDiasISO(hoy, 14) } : { desde: sumarDiasISO(hoy, -14), hasta: hoy })
      setEstado({ cargando: false, salidas: d.salidas ?? [], error: null })
    } catch (err) {
      setEstado({ cargando: false, salidas: [], error: mensajeDeErrorUnidades(err) })
    }
  }, [filtro])

  useEffect(() => {
    setEstado((e) => ({ ...e, cargando: true }))
    cargar()
  }, [cargar])

  const regresa = useMemo(() => new Map(unidades.map((u) => [u.id, u.regresaAStock])), [unidades])

  const anular = async (s) => {
    setAccionError(null)
    try {
      await anularSalida(s.id)
      await cargar()
    } catch (err) {
      setAccionError(mensajeDeErrorUnidades(err))
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setHoja({ tipo: 'nueva' })}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tinta text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Plus size={16} aria-hidden="true" />
        Nueva salida a calle
      </button>

      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-borde/60 p-1" role="tablist" aria-label="Qué salidas ver">
        {[
          ['proximas', 'Hoy y próximas'],
          ['recientes', 'Últimas'],
        ].map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)} className={`min-h-11 rounded-lg text-sm font-semibold ${filtro === id ? 'bg-hueso shadow-sm' : 'text-gris'}`}>
            {texto}
          </button>
        ))}
      </div>

      <MensajeError texto={accionError} />
      {estado.cargando && <Cargando texto="Leyendo las salidas…" />}
      {estado.error && <ErrorCarga mensaje={estado.error} />}
      {!estado.cargando && !estado.error && estado.salidas.length === 0 && (
        <Tarjeta className="text-center text-sm text-gris">
          {filtro === 'proximas' ? 'No hay salidas planificadas. Lo normal es planificar la de mañana el día anterior.' : 'No hay salidas en los últimos 14 días.'}
        </Tarjeta>
      )}

      <ul className="flex flex-col gap-3">
        {estado.salidas.map((s) => (
          <li key={s.id}>
            <Tarjeta className={s.estado === 'anulada' ? 'opacity-60' : ''}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[15px] font-bold">
                  {diaLegible(s.fecha)}
                  {s.fecha === mananaLima() ? ' · mañana' : s.fecha === hoyLima() ? ' · hoy' : ''}
                </p>
                <Pill tono={ESTADOS[s.estado].tono}>{ESTADOS[s.estado].texto}</Pill>
              </div>
              <p className="mt-0.5 text-xs text-gris">
                {s.unidad} · desde {s.sede ?? 'un local'}
                {s.creadoPor ? ` · la registró ${s.creadoPor}` : ''}
              </p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {s.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{i.tamano ? `${i.producto} · ${i.tamano}` : i.producto}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {s.estado === 'salio'
                        ? `${i.cantidadSalio}${i.cantidadDevuelta ? ` (−${i.cantidadDevuelta})` : ''}`
                        : i.cantidad}
                    </span>
                  </li>
                ))}
              </ul>
              {s.nota && <p className="mt-1.5 text-xs italic text-gris">«{s.nota}»</p>}
              {s.estado === 'salio' && esAdmin && (
                <p className="mt-2 text-xs text-gris">
                  Valor a precio interno: <b className="text-tinta">{formatoSoles(s.valor)}</b>
                  {s.lineasSinPrecio > 0 && <span className="text-acento-oscuro"> · {s.lineasSinPrecio} línea{s.lineasSinPrecio === 1 ? '' : 's'} sin precio interno</span>}
                </p>
              )}

              {s.estado === 'planificada' && (
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button type="button" onClick={() => setHoja({ tipo: 'salio', salida: s })} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tinta px-3 text-sm font-semibold text-white">
                    <PackageCheck size={16} aria-hidden="true" />
                    Confirmar que salió
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setHoja({ tipo: 'editar', salida: s })} className="min-h-11 rounded-xl border border-borde bg-white text-sm font-semibold">
                      Editar
                    </button>
                    <button type="button" onClick={() => anular(s)} className="min-h-11 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-700">
                      Anular
                    </button>
                  </div>
                </div>
              )}
              {s.estado === 'salio' && (
                <button type="button" onClick={() => setHoja({ tipo: 'devolucion', salida: s })} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-borde bg-white px-3 text-sm font-semibold">
                  <Undo2 size={16} aria-hidden="true" />
                  Anotar lo que volvió
                </button>
              )}
            </Tarjeta>
          </li>
        ))}
      </ul>

      {hoja?.tipo === 'nueva' && <HojaSalida unidades={unidades} sedes={sedes} skus={skus} salida={undefined} onCerrar={() => setHoja(null)} onGuardada={cargar} />}
      {hoja?.tipo === 'editar' && <HojaSalida unidades={unidades} sedes={sedes} skus={skus} salida={hoja.salida} onCerrar={() => setHoja(null)} onGuardada={cargar} />}
      {hoja?.tipo === 'salio' && <HojaSalio salida={hoja.salida} skus={skus} onCerrar={() => setHoja(null)} onHecha={cargar} />}
      {hoja?.tipo === 'devolucion' && <HojaDevolucion salida={hoja.salida} regresaAStock={regresa.get(hoja.salida.unidadId) ?? false} onCerrar={() => setHoja(null)} onHecha={cargar} />}
    </div>
  )
}
