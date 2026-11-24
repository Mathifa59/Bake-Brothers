import { useCallback, useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { listarPorcionados, mensajeDeErrorPorcionado, revertirPorcionado } from '../../lib/porcionadoApi'
import { fechaHoraLegible } from '../../utils/equipo'
import { Hoja, MensajeError } from '../equipo/campos'
import { Cargando } from '../bakeos/ui'

/** Historial de porcionados del local (solo Administración): quién, cuándo y cuánto, con «Revertir». */
export default function HistorialPorcionados({ sedeId, sedeNombre, onCerrar, onCambio }) {
  const [estado, setEstado] = useState({ cargando: true, lista: [], error: null })
  const [revirtiendo, setRevirtiendo] = useState(null) // id con la confirmación abierta
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const d = await listarPorcionados({ sedeId, limite: 50 })
      setEstado({ cargando: false, lista: d.porcionados ?? [], error: null })
    } catch (err) {
      setEstado({ cargando: false, lista: [], error: mensajeDeErrorPorcionado(err) })
    }
  }, [sedeId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const revertir = async (id) => {
    setOcupado(true)
    setError(null)
    try {
      await revertirPorcionado(id, motivo.trim())
      setRevirtiendo(null)
      setMotivo('')
      await cargar()
      onCambio()
    } catch (err) {
      setError(mensajeDeErrorPorcionado(err))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Hoja titulo={`Porcionados · ${sedeNombre ?? 'local'}`} onCerrar={onCerrar} aviso={<MensajeError texto={error} />}>
      {estado.cargando && <Cargando texto="Leyendo el historial…" />}
      {estado.error && <MensajeError texto={estado.error} />}
      {!estado.cargando && !estado.error && estado.lista.length === 0 && <p className="py-6 text-center text-sm text-gris">Todavía no se ha porcionado nada en este local.</p>}
      <ul className="flex flex-col gap-2.5">
        {estado.lista.map((p) => (
          <li key={p.id} className={`rounded-2xl border border-borde bg-white p-3.5 ${p.revertidoEn ? 'opacity-70' : ''}`}>
            <p className="text-sm font-semibold leading-snug">
              {p.enteras} {p.enteras === 1 ? 'entera' : 'enteras'} de {p.producto} → {p.porcionesGeneradas} porciones
            </p>
            <p className="mt-0.5 text-xs text-gris">
              {p.tamanoEntero} → {p.tamanoPorcion} · rinde {p.rendimiento} · {p.hechoPor ?? 'alguien'} · {fechaHoraLegible(p.hechoEn)}
            </p>
            {p.revertidoEn ? (
              <p className="mt-1.5 text-xs font-semibold text-acento-oscuro">
                Revertido por {p.revertidoPor ?? 'alguien'} · {fechaHoraLegible(p.revertidoEn)}
                {p.motivoReversion ? ` · «${p.motivoReversion}»` : ''}
              </p>
            ) : revirtiendo === p.id ? (
              <div className="mt-2.5 space-y-2">
                <p className="text-xs text-gris">Se devuelven las enteras y se quitan esas porciones del Stock. Si ya no están, no se puede.</p>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={300}
                  placeholder="Motivo (opcional)"
                  aria-label="Motivo de la reversión"
                  className="min-h-11 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setRevirtiendo(null); setError(null) }} className="h-11 rounded-xl border border-borde bg-white text-sm font-semibold">
                    No
                  </button>
                  <button type="button" onClick={() => revertir(p.id)} disabled={ocupado} className="h-11 rounded-xl bg-red-700 text-sm font-semibold text-white disabled:opacity-50">
                    Sí, revertir
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setRevirtiendo(p.id); setError(null) }} className="mt-2 flex min-h-11 items-center gap-1.5 rounded-xl border border-borde bg-hueso px-3 text-sm font-semibold">
                <Undo2 size={15} aria-hidden="true" />
                Revertir
              </button>
            )}
          </li>
        ))}
      </ul>
    </Hoja>
  )
}
