import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { registrarOrdenRappi } from '../../lib/apiClient'
import { mensajeDeError } from '../../utils/ordenes'
import ListaProductos from './ListaProductos'

/**
 * Registro rápido de la orden de la tablet de Rappi: número de orden, productos y el total tal cual lo dice la
 * tablet (los precios de Rappi no son los de la carta, por eso las líneas van sin precio).
 */
export default function FormRappi({ productos, fecha, corte, onRegistrada, sedeId }) {
  const [referencia, setReferencia] = useState('')
  const [hora, setHora] = useState('')
  const [lineas, setLineas] = useState([])
  const [total, setTotal] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [hecho, setHecho] = useState(null)

  const totalNum = Number(String(total).replace(',', '.'))
  const listo = referencia.trim() && lineas.length > 0 && Number.isFinite(totalNum) && totalNum > 0

  const enviar = async (e) => {
    e.preventDefault()
    if (!listo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await registrarOrdenRappi({
        referenciaExterna: referencia.trim(),
        ...(sedeId ? { sedeId } : {}),
        fechaEntrega: fecha,
        hora: hora.trim() || null,
        items: lineas.map((l) => ({ productoId: l.productoId, tamano: l.tamano, cantidad: l.cantidad })),
        total: totalNum,
        nota: nota.trim() || null,
      })
      setHecho({ numero: r.numero, fueraDeCorte: r.corte?.fueraDeCorte, referencia: referencia.trim() })
      onRegistrada?.()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const limpiar = () => {
    setHecho(null)
    setReferencia('')
    setHora('')
    setLineas([])
    setTotal('')
    setNota('')
  }

  if (hecho) {
    return (
      <div className="rounded-2xl border border-borde bg-hueso p-5 text-center">
        <CheckCircle2 className="mx-auto text-ok" size={36} aria-hidden="true" />
        <p className="mt-2 text-lg font-bold">Orden {hecho.numero} registrada</p>
        <p className="mt-1 text-sm text-gris">Rappi {hecho.referencia}</p>
        {hecho.fueraDeCorte && (
          <p className="mt-3 rounded-xl bg-acento-suave px-3 py-2 text-sm font-semibold text-acento-oscuro">
            Se registró fuera de corte: producción lo verá marcado.
          </p>
        )}
        <button type="button" onClick={limpiar} className="mt-4 h-11 w-full rounded-xl bg-tinta text-sm font-semibold text-white">
          Registrar otra orden
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {corte?.fueraDeCorte && (
        <p role="status" className="rounded-xl bg-acento-suave px-3 py-2.5 text-sm font-semibold text-acento-oscuro">
          {corte.motivo === 'pasado_el_corte'
            ? 'Ya pasó el corte de las 10:30 p. m. Se registra igual, pero queda marcada como fuera de corte.'
            : 'Esta orden es para hoy o antes: queda marcada como fuera de corte.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-semibold" htmlFor="rap-numero">
            N.º de orden
          </label>
          <input
            id="rap-numero"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Ej. 5521"
            className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold" htmlFor="rap-hora">
            Hora (opcional)
          </label>
          <input
            id="rap-hora"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            placeholder="1:30 pm"
            className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
          />
        </div>
      </div>

      <ListaProductos
        titulo="Productos"
        vacio="Agrega los productos que muestra la tablet."
        productos={productos}
        lineas={lineas}
        onCambio={setLineas}
      />

      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="rap-total">
          Total de la tablet (S/)
        </label>
        <input
          id="rap-total"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base font-bold outline-none focus:border-acento"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="rap-nota">
          Nota (opcional)
        </label>
        <input
          id="rap-nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!listo || enviando}
        className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {enviando ? 'Registrando…' : 'Registrar orden de Rappi'}
      </button>
    </form>
  )
}
