import { useMemo, useState } from 'react'
import { CheckCircle2, Minus, Plus } from 'lucide-react'
import { MAX_ENTERAS_POR_PORCIONADO, planearPorcionado } from '@bakebrothers/domain'
import { mensajeDeErrorPorcionado, porcionar } from '../../lib/porcionadoApi'
import { Hoja, MensajeError } from '../equipo/campos'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/**
 * «Porcionar»: resta enteras y suma porciones en el Stock de este local, según la regla del producto. La vista previa usa
 * la misma lógica que la API (`planearPorcionado`), así que lo que se ve es lo que va a pasar; la API vuelve a decidir con
 * el stock real al confirmar.
 *
 * `entero` y `porcion`: la fila de stock de cada tamaño en este local ({ cantidad } o undefined si no hay fila).
 */
export default function HojaPorcionar({ producto, regla, tamanoEntero, tamanoPorcion, entero, porcion, sedeId, sedeNombre, esAdmin, onCerrar, onHecho }) {
  const [enteras, setEnteras] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [hecho, setHecho] = useState(null)

  const plan = useMemo(
    () =>
      planearPorcionado({
        enteras,
        rendimiento: regla.porciones,
        entero: { existe: Boolean(entero), cantidad: entero ? entero.cantidad : null },
        porcion: { existe: Boolean(porcion), cantidad: porcion ? porcion.cantidad : null },
      }),
    [enteras, regla.porciones, entero, porcion]
  )

  const cambiar = (n) => {
    setError(null)
    setEnteras(Math.min(MAX_ENTERAS_POR_PORCIONADO, Math.max(1, Math.trunc(Number(n)) || 1)))
  }

  const confirmar = async () => {
    if (!plan.ok) return
    setEnviando(true)
    setError(null)
    try {
      const r = await porcionar({ reglaId: regla.id, enteras, sedeId: esAdmin ? sedeId : undefined })
      setHecho(r)
      onHecho()
    } catch (err) {
      setError(mensajeDeErrorPorcionado(err))
    } finally {
      setEnviando(false)
    }
  }

  if (hecho) {
    return (
      <Hoja
        titulo="Porcionado hecho"
        onCerrar={onCerrar}
        pie={
          <button type="button" onClick={onCerrar} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white">
            Listo
          </button>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl bg-ok-suave p-4">
          <CheckCircle2 size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold">
              {plural(hecho.enteras, 'entera', 'enteras')} de {hecho.producto} → {plural(hecho.porcionesGeneradas, 'porción', 'porciones')}
            </p>
            <p className="mt-1 text-sm text-gris">
              En Stock de {sedeNombre ?? 'este local'} quedan {plural(hecho.enterasQuedan, 'entera', 'enteras')} y {plural(hecho.porcionesQuedan, 'porción', 'porciones')}.
              Quedó registrado a tu nombre.
            </p>
          </div>
        </div>
      </Hoja>
    )
  }

  return (
    <Hoja
      titulo={`Porcionar ${producto.nombre}`}
      onCerrar={onCerrar}
      aviso={<MensajeError texto={error} />}
      pie={
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando || !plan.ok}
          className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {enviando ? 'Porcionando…' : plan.ok ? `Porcionar ${plural(enteras, 'entera', 'enteras')}` : 'No se puede porcionar'}
        </button>
      }
    >
      <p className="text-sm text-gris">
        {tamanoEntero} → {tamanoPorcion}. Cada entera rinde <b className="text-tinta">{regla.porciones} porciones</b>. Se resta de Stock en {sedeNombre ?? 'este local'}.
      </p>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl border border-borde bg-white p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-gris">Enteras hoy</p>
          <p className="mt-1 text-2xl font-bold">{entero && entero.cantidad !== null ? entero.cantidad : '—'}</p>
        </div>
        <div className="rounded-2xl border border-borde bg-white p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-gris">Porciones hoy</p>
          <p className="mt-1 text-2xl font-bold">{porcion ? (porcion.cantidad !== null ? porcion.cantidad : '—') : 0}</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">¿Cuántas enteras porcionas?</p>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Una menos" onClick={() => cambiar(enteras - 1)} disabled={enteras <= 1} className="grid h-12 w-12 place-items-center rounded-xl border border-borde bg-white disabled:opacity-30">
            <Minus size={18} aria-hidden="true" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={MAX_ENTERAS_POR_PORCIONADO}
            value={enteras}
            onChange={(e) => cambiar(e.target.value)}
            aria-label="Cantidad de enteras a porcionar"
            className="h-12 min-w-0 flex-1 rounded-xl border border-borde bg-white text-center text-xl font-bold outline-none focus:border-acento"
          />
          <button type="button" aria-label="Una más" onClick={() => cambiar(enteras + 1)} className="grid h-12 w-12 place-items-center rounded-xl border border-borde bg-white">
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {plan.ok ? (
        <div className="rounded-2xl bg-acento-suave/60 p-4" aria-live="polite">
          <p className="text-base font-bold">
            −{plural(enteras, 'entera', 'enteras')} · +{plural(plan.porcionesGeneradas, 'porción', 'porciones')}
          </p>
          <p className="mt-1 text-sm text-gris">
            Quedarán {plural(plan.enterasQuedan, 'entera', 'enteras')} y {plural(plan.porcionesQuedan, 'porción', 'porciones')}.
            {!porcion && ' Las porciones empiezan a contarse con esta.'}
          </p>
        </div>
      ) : (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          {plan.detalle}
        </p>
      )}
    </Hoja>
  )
}
