import { useState } from 'react'
import { Printer } from 'lucide-react'
import { guardarResponsables, imprimirHoja, responsablesGuardados } from '../../lib/hojaDelDia'
import { mensajeDeError } from '../../utils/ordenes'
import { Tarjeta } from '../bakeos/ui'

/**
 * Imprimir: UNA sola hoja con todas las órdenes del día (mayoristas, agendados y resumen de producción), como su Excel.
 * No hay impresión por orden. Imprimir solo una parte es una opción secundaria, discreta.
 */
export default function ImprimirHojas({ fecha, sedeId, esAdmin }) {
  const inicial = responsablesGuardados()
  const [carga, setCarga] = useState(inicial.carga)
  const [empaque, setEmpaque] = useState(inicial.empaque)
  const [generando, setGenerando] = useState(null)
  const [error, setError] = useState(null)

  const imprimir = async (hoja) => {
    setGenerando(hoja)
    setError(null)
    guardarResponsables({ carga, empaque })
    try {
      await imprimirHoja(hoja, { fecha, sedeId, esAdmin, carga, empaque })
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGenerando(null)
    }
  }

  const campo = 'h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento'
  return (
    <Tarjeta className="mb-3">
      <h3 className="text-sm font-bold text-tinta">Imprimir la hoja del día</h3>
      <p className="mt-0.5 text-xs text-gris">Una sola hoja con todas las órdenes: mayoristas, agendados y resumen de producción.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gris">
          Responsable de carga
          <input value={carga} onChange={(e) => setCarga(e.target.value)} maxLength={40} placeholder="Ej.: Luciana" className={`mt-1 ${campo}`} />
        </label>
        <label className="block text-xs font-semibold text-gris">
          Responsable de empaque <span className="font-normal">(hoja de mayoristas)</span>
          <input value={empaque} onChange={(e) => setEmpaque(e.target.value)} maxLength={40} placeholder="Ej.: Sheyla" className={`mt-1 ${campo}`} />
        </label>
      </div>
      <button
        type="button"
        onClick={() => imprimir('dia')}
        disabled={generando !== null}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50"
      >
        <Printer size={18} aria-hidden="true" />
        {generando === 'dia' ? 'Generando…' : 'Imprimir hoja del día'}
      </button>
      <p className="mt-3 text-xs text-gris">
        ¿Solo una parte?{' '}
        {[
          { id: 'mayoristas', texto: 'Solo mayoristas' },
          { id: 'agendados', texto: 'Solo agendados' },
        ].map((h, i) => (
          <span key={h.id}>
            {i > 0 && ' · '}
            <button
              type="button"
              onClick={() => imprimir(h.id)}
              disabled={generando !== null}
              className="inline-block py-2 font-semibold text-acento-oscuro underline underline-offset-2 disabled:opacity-50"
            >
              {generando === h.id ? 'Generando…' : h.texto}
            </button>
          </span>
        ))}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </Tarjeta>
  )
}
