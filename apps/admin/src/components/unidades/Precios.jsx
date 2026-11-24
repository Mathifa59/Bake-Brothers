import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { guardarPrecios, listarPrecios, mensajeDeErrorUnidades } from '../../lib/unidadesApi'
import { formatoSoles } from '../../utils/unidades'
import { Cargando, ErrorCarga, Tarjeta } from '../bakeos/ui'
import { MensajeError } from '../equipo/campos'

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const claveDe = (f) => `${f.productId}:${f.productSizeId ?? ''}`

/**
 * Lista de precios internos de una unidad (solo Administración). Nace vacía: se carga a medida que el dueño confirma los
 * precios. Dejar el campo vacío quita el precio. Cada cambio queda en el historial de la base.
 */
export default function Precios({ unidades }) {
  const [unidadId, setUnidadId] = useState(unidades[0]?.id ?? '')
  const [estado, setEstado] = useState({ cargando: true, filas: [], error: null })
  const [busqueda, setBusqueda] = useState('')
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const [error, setError] = useState(null)
  const [guardado, setGuardado] = useState(null) // clave del último guardado, para el «Guardado»
  const guardando = useRef(new Set())

  const cargar = useCallback(async () => {
    if (!unidadId) return
    try {
      const d = await listarPrecios(unidadId)
      setEstado({ cargando: false, filas: d.filas, error: null })
    } catch (err) {
      setEstado({ cargando: false, filas: [], error: mensajeDeErrorUnidades(err) })
    }
  }, [unidadId])

  useEffect(() => {
    setEstado({ cargando: true, filas: [], error: null })
    cargar()
  }, [cargar])

  const guardarFila = async (fila, texto) => {
    const limpio = texto.trim().replace(',', '.')
    const nuevo = limpio === '' ? null : Number(limpio)
    if (nuevo !== null && (!Number.isFinite(nuevo) || nuevo < 0)) return setError('El precio tiene que ser un número de 0 en adelante.')
    if (nuevo === fila.precio) return
    const clave = claveDe(fila)
    if (guardando.current.has(clave)) return
    guardando.current.add(clave)
    setError(null)
    try {
      await guardarPrecios(unidadId, [{ productId: fila.productId, productSizeId: fila.productSizeId, precio: nuevo }])
      setEstado((e) => ({ ...e, filas: e.filas.map((f) => (claveDe(f) === clave ? { ...f, precio: nuevo } : f)) }))
      setGuardado(clave)
      setTimeout(() => setGuardado((g) => (g === clave ? null : g)), 1800)
    } catch (err) {
      setError(mensajeDeErrorUnidades(err))
      await cargar()
    } finally {
      guardando.current.delete(clave)
    }
  }

  const conPrecio = estado.filas.filter((f) => f.precio !== null).length
  const secciones = useMemo(() => {
    const q = sinTildes(busqueda).trim()
    const grupos = new Map()
    for (const f of estado.filas) {
      if (soloSinPrecio && f.precio !== null) continue
      if (q && !q.split(/\s+/).every((p) => sinTildes(`${f.producto} ${f.tamano ?? ''} ${f.tipo ?? ''}`).includes(p))) continue
      const tipo = f.tipo ?? 'Otros'
      if (!grupos.has(tipo)) grupos.set(tipo, [])
      grupos.get(tipo).push(f)
    }
    return [...grupos.entries()]
  }, [estado.filas, busqueda, soloSinPrecio])

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5 rounded-xl bg-borde/60 p-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, unidades.length)}, minmax(0, 1fr))` }} role="tablist" aria-label="Unidad">
        {unidades.map((u) => (
          <button key={u.id} type="button" role="tab" aria-selected={unidadId === u.id} onClick={() => setUnidadId(u.id)} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${unidadId === u.id ? 'bg-hueso shadow-sm' : 'text-gris'}`}>
            {u.nombre}
          </button>
        ))}
      </div>

      <p role="note" className="rounded-xl bg-acento-suave p-3 text-xs text-acento-oscuro">
        Precio interno por unidad: lo que esa unidad le paga a Bake por cada producto. Se escribe y se guarda al salir de la casilla; vacío = sin precio. Lo que sale antes
        de cargar el precio se cuenta igual y se valora cuando lo cargues.
      </p>

      <label className="flex h-11 items-center gap-2 rounded-xl border border-borde bg-hueso px-3">
        <Search size={16} className="shrink-0 text-gris" aria-hidden="true" />
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto o tamaño" aria-label="Buscar producto o tamaño" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-gris/70" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <button type="button" aria-pressed={soloSinPrecio} onClick={() => setSoloSinPrecio((v) => !v)} className={`h-11 rounded-full px-4 text-sm font-semibold ${soloSinPrecio ? 'bg-acento-suave text-acento-oscuro' : 'bg-borde/60 text-gris'}`}>
          Solo sin precio
        </button>
        {!estado.cargando && (
          <p className="text-xs text-gris" aria-live="polite">
            {conPrecio} de {estado.filas.length} con precio
          </p>
        )}
      </div>

      <MensajeError texto={error} />
      {estado.cargando && <Cargando texto="Leyendo la lista…" />}
      {estado.error && <ErrorCarga mensaje={estado.error} />}

      {secciones.map(([tipo, filas]) => (
        <section key={tipo} aria-label={tipo}>
          <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-gris">{tipo}</h3>
          <Tarjeta className="divide-y divide-borde/60 p-0">
            {filas.map((f) => (
              <div key={claveDe(f)} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{f.producto}</p>
                  <p className="text-[11px] text-gris">
                    {f.tamano ? `${f.tamano} · ` : ''}público {f.precioPublico === null ? '—' : formatoSoles(f.precioPublico)}
                    {guardado === claveDe(f) && <span className="font-bold text-ok"> · Guardado</span>}
                  </p>
                </div>
                <span className="text-sm text-gris" aria-hidden="true">
                  S/
                </span>
                <input
                  key={`${claveDe(f)}:${f.precio ?? ''}`}
                  inputMode="decimal"
                  enterKeyHint="done"
                  defaultValue={f.precio ?? ''}
                  placeholder="—"
                  aria-label={`Precio interno de ${f.producto}${f.tamano ? ` ${f.tamano}` : ''}`}
                  onBlur={(e) => guardarFila(f, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="h-11 w-20 shrink-0 rounded-xl border border-borde bg-white px-2 text-center text-base font-semibold outline-none placeholder:text-gris/60 focus:border-acento"
                />
              </div>
            ))}
          </Tarjeta>
        </section>
      ))}
      {!estado.cargando && !estado.error && secciones.length === 0 && <Tarjeta className="text-center text-sm text-gris">Ningún producto coincide.</Tarjeta>}
    </div>
  )
}
