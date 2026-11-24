import { useMemo, useState } from 'react'
import { Plus, Scissors } from 'lucide-react'
import { MAX_PORCIONES_POR_REGLA } from '@bakebrothers/domain'
import { Interruptor } from './EditorProducto'

const campo = 'min-h-11 rounded-xl border border-borde bg-white px-3 text-[15px] outline-none focus:border-acento'
// Las tortas mini se venden siempre enteras (decisión del dueño): no se ofrecen como tamaño a porcionar.
const esMini = (tamano) => /^mini/i.test(String(tamano ?? '').trim())

/**
 * Reglas de porcionado de un producto ya guardado (solo Administración): de qué tamaño entero se porciona, a qué tamaño y
 * cuántas porciones rinde. Se guardan aparte del resto del producto. Una regla no se borra: se apaga. Los datos
 * iniciales (Familiar → Individual) los cargó la migración 0057; aquí se editan.
 */
export default function SeccionPorcionado({ producto, onGuardarRegla }) {
  const tamanos = useMemo(() => (producto.product_sizes ?? []).filter((t) => t.activo !== false), [producto])
  const reglas = producto.porcionado_reglas ?? []
  const nombreDe = (id) => producto.product_sizes?.find((t) => t.id === id)?.tamano ?? '—'
  const [borradores, setBorradores] = useState({}) // id -> { porciones, activo }
  const [nueva, setNueva] = useState(null) // { enteroId, porcionId, porciones } | null
  const [ocupado, setOcupado] = useState(null)
  const [mensaje, setMensaje] = useState(null) // { tipo, texto }

  if (tamanos.length < 2) return null

  const candidatosEnteros = tamanos.filter((t) => !esMini(t.tamano) && !reglas.some((r) => r.size_entero_id === t.id))
  const valorDe = (r) => borradores[r.id] ?? { porciones: String(r.porciones), activo: r.activo }

  const guardar = async (clave, regla) => {
    setOcupado(clave)
    setMensaje(null)
    try {
      await onGuardarRegla(producto.id, regla)
      setMensaje({ tipo: 'ok', texto: 'Regla guardada.' })
      setBorradores((b) => {
        const { [clave]: _quitado, ...resto } = b
        return resto
      })
      if (clave === 'nueva') setNueva(null)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setOcupado(null)
    }
  }

  const guardarExistente = (r) => {
    const v = valorDe(r)
    const n = Number(v.porciones)
    if (!Number.isInteger(n) || n < 1 || n > MAX_PORCIONES_POR_REGLA) return setMensaje({ tipo: 'error', texto: `Las porciones van de 1 a ${MAX_PORCIONES_POR_REGLA}.` })
    guardar(r.id, { id: r.id, sizeEnteroId: r.size_entero_id, sizePorcionId: r.size_porcion_id, porciones: n, activo: v.activo })
  }

  const guardarNueva = () => {
    const n = Number(nueva.porciones)
    if (!nueva.enteroId || !nueva.porcionId) return setMensaje({ tipo: 'error', texto: 'Elige de qué tamaño se porciona y a cuál.' })
    if (!Number.isInteger(n) || n < 1 || n > MAX_PORCIONES_POR_REGLA) return setMensaje({ tipo: 'error', texto: `Las porciones van de 1 a ${MAX_PORCIONES_POR_REGLA}.` })
    guardar('nueva', { sizeEnteroId: nueva.enteroId, sizePorcionId: nueva.porcionId, porciones: n, activo: true })
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-hueso p-3.5" aria-label="Porcionado">
      <div className="flex items-center gap-2">
        <Scissors size={16} aria-hidden="true" className="text-gris" />
        <h3 className="text-sm font-bold">Porcionado</h3>
      </div>
      <p className="text-xs text-gris">
        Con una regla activa, en Stock aparece «Porcionar» en ese tamaño (para Administración y las encargadas): resta enteras y suma porciones. Las tortas mini se
        venden siempre enteras y no llevan regla.
      </p>

      {reglas.length === 0 && !nueva && <p className="rounded-xl bg-borde/40 px-3.5 py-3 text-sm text-gris">Este producto no se porciona.</p>}

      <ul className="flex flex-col gap-2">
        {reglas.map((r) => {
          const v = valorDe(r)
          const cambiado = String(r.porciones) !== v.porciones || r.activo !== v.activo
          return (
            <li key={r.id} className={`flex flex-col gap-2 rounded-xl border border-borde bg-white p-2.5 ${v.activo ? '' : 'opacity-70'}`}>
              <p className="text-sm font-semibold">
                {nombreDe(r.size_entero_id)} → {nombreDe(r.size_porcion_id)}
              </p>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gris">Rinde</span>
                  <input
                    aria-label={`Porciones de ${nombreDe(r.size_entero_id)}`}
                    inputMode="numeric"
                    className={`${campo} w-20 text-center`}
                    value={v.porciones}
                    onChange={(e) => setBorradores((b) => ({ ...b, [r.id]: { ...v, porciones: e.target.value.replace(/\D/g, '') } }))}
                  />
                  <span className="text-gris">porciones</span>
                </label>
                <span className="flex-1" />
                <Interruptor activo={v.activo} onClick={() => setBorradores((b) => ({ ...b, [r.id]: { ...v, activo: !v.activo } }))} etiqueta={`Regla de ${nombreDe(r.size_entero_id)} activa`} />
              </div>
              {cambiado && (
                <button type="button" disabled={ocupado === r.id} onClick={() => guardarExistente(r)} className="min-h-11 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50">
                  {ocupado === r.id ? 'Guardando…' : 'Guardar regla'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {nueva ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-borde bg-white p-2.5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Se porciona desde</span>
            <select className={campo} value={nueva.enteroId} onChange={(e) => setNueva({ ...nueva, enteroId: e.target.value })}>
              <option value="">Elige un tamaño…</option>
              {candidatosEnteros.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tamano}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">A</span>
            <select className={campo} value={nueva.porcionId} onChange={(e) => setNueva({ ...nueva, porcionId: e.target.value })}>
              <option value="">Elige un tamaño…</option>
              {tamanos
                .filter((t) => t.id !== nueva.enteroId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tamano}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Rinde</span>
            <input aria-label="Porciones que rinde" inputMode="numeric" className={`${campo} w-20 text-center`} value={nueva.porciones} onChange={(e) => setNueva({ ...nueva, porciones: e.target.value.replace(/\D/g, '') })} />
            <span className="text-gris">porciones</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setNueva(null); setMensaje(null) }} className="min-h-11 rounded-xl border border-borde bg-white text-sm font-semibold">
              Cancelar
            </button>
            <button type="button" disabled={ocupado === 'nueva'} onClick={guardarNueva} className="min-h-11 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50">
              {ocupado === 'nueva' ? 'Guardando…' : 'Crear regla'}
            </button>
          </div>
        </div>
      ) : (
        candidatosEnteros.length > 0 && (
          <button type="button" onClick={() => setNueva({ enteroId: '', porcionId: '', porciones: '' })} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-borde bg-white text-sm font-semibold">
            <Plus size={16} aria-hidden="true" /> Agregar regla
          </button>
        )
      )}

      {mensaje && (
        <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-2 text-sm ${mensaje.tipo === 'error' ? 'bg-red-50 text-red-700' : 'bg-ok-suave text-ok'}`}>
          {mensaje.texto}
        </p>
      )}
    </section>
  )
}
