import { useState } from 'react'
import { FileText } from 'lucide-react'
import { abrirPdfAutenticado } from '../../lib/apiClient'
import { mensajeDeError } from '../../utils/ordenes'
import { Tarjeta } from '../bakeos/ui'

// Los responsables de carga y de empaque se escriben al imprimir (su hoja los trae arriba). Se recuerdan los últimos
// usados en este dispositivo para no volver a escribirlos cada día; si el navegador no deja guardar, no pasa nada.
const CLAVE = 'bakeos:responsables-hoja'
const leerGuardado = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '{}')
  } catch {
    return {}
  }
}
const guardar = (valor) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(valor))
  } catch {
    // sin almacenamiento: se escribe de nuevo la próxima vez
  }
}

/** Imprimir las hojas del día: pedidos mayoristas (empaque) y pedidos agendados (venta digital). */
export default function ImprimirHojas({ fecha, sedeId, esAdmin }) {
  const inicial = leerGuardado()
  const [carga, setCarga] = useState(inicial.carga ?? '')
  const [empaque, setEmpaque] = useState(inicial.empaque ?? '')
  const [generando, setGenerando] = useState(null)
  const [error, setError] = useState(null)

  const imprimir = async (hoja) => {
    setGenerando(hoja)
    setError(null)
    guardar({ carga, empaque })
    const params = new URLSearchParams({ fecha })
    if (esAdmin && sedeId) params.set('sedeId', sedeId)
    if (carga.trim()) params.set('carga', carga.trim())
    if (hoja === 'mayoristas' && empaque.trim()) params.set('empaque', empaque.trim())
    const ruta = hoja === 'mayoristas' ? 'empaque-mayorista' : 'agendados'
    try {
      await abrirPdfAutenticado(`/api/dashboard/ordenes/${ruta}.pdf?${params}`, `${ruta}-${fecha}.pdf`)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGenerando(null)
    }
  }

  const campo = 'h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento'
  return (
    <Tarjeta className="mb-3">
      <h3 className="text-sm font-bold text-tinta">Imprimir las hojas del día</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gris">
          Responsable de carga
          <input value={carga} onChange={(e) => setCarga(e.target.value)} maxLength={40} placeholder="Ej.: Luciana" className={`mt-1 ${campo}`} />
        </label>
        <label className="block text-xs font-semibold text-gris">
          Responsable de empaque <span className="font-normal">(solo mayoristas)</span>
          <input value={empaque} onChange={(e) => setEmpaque(e.target.value)} maxLength={40} placeholder="Ej.: Sheyla" className={`mt-1 ${campo}`} />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          { id: 'mayoristas', texto: 'Pedidos mayoristas' },
          { id: 'agendados', texto: 'Pedidos agendados' },
        ].map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => imprimir(h.id)}
            disabled={generando !== null}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50"
          >
            <FileText size={16} aria-hidden="true" />
            {generando === h.id ? 'Generando…' : h.texto}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </Tarjeta>
  )
}
