import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const meses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const diasSemana = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

const parseISO = (s) => {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
const toISO = (fecha) => {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const formatoLargo = (fecha) =>
  `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`
const soloDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
const mismoDia = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Calendario propio que SIEMPRE se despliega hacia abajo del campo.
// Emite un evento sintético { target: { value } } para ser compatible con los
// manejadores onChange existentes (los mismos `set('campo')` de los formularios).
export default function DatePicker({ label, value, onChange, min, placeholder = 'dd/mm/aaaa' }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  const seleccionada = parseISO(value)
  const minDate = min ? soloDia(parseISO(min)) : null
  const [visible, setVisible] = useState(seleccionada || minDate || new Date())

  useEffect(() => {
    if (abierto) setVisible(seleccionada || minDate || new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    const escape = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  const anio = visible.getFullYear()
  const mes = visible.getMonth()
  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()

  const celdas = []
  for (let i = 0; i < primerDia; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d)

  const hoy = new Date()
  const deshabilitado = (d) => (minDate ? new Date(anio, mes, d) < minDate : false)
  const puedeRetroceder = () => !minDate || new Date(anio, mes, 0) >= minDate

  const elegir = (d) => {
    onChange?.({ target: { value: toISO(new Date(anio, mes, d)) } })
    setAbierto(false)
  }

  return (
    <div className="block" ref={ref}>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-tinta/70 uppercase">
          {label}
        </span>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-borde bg-white px-4 py-3 text-left text-sm outline-none transition-all focus:border-acento focus:ring-2 focus:ring-acento/20"
          aria-haspopup="dialog"
          aria-expanded={abierto}
        >
          <span className={seleccionada ? 'text-tinta' : 'text-gris/60'}>
            {seleccionada ? formatoLargo(seleccionada) : placeholder}
          </span>
          <Calendar size={17} className={abierto ? 'text-acento' : 'text-gris'} />
        </button>

        {abierto && (
          <div
            className="anim-fade-in absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-borde bg-white p-4 shadow-xl shadow-tinta/10"
            role="dialog"
            aria-label="Selector de fecha"
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => puedeRetroceder() && setVisible(new Date(anio, mes - 1, 1))}
                disabled={!puedeRetroceder()}
                className="grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-acento-suave disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-display text-sm font-semibold">
                {meses[mes]} {anio}
              </span>
              <button
                type="button"
                onClick={() => setVisible(new Date(anio, mes + 1, 1))}
                className="grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-acento-suave cursor-pointer"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {diasSemana.map((d) => (
                <span key={d} className="py-1 text-[10px] font-bold uppercase text-gris">{d}</span>
              ))}
              {celdas.map((d, i) =>
                d === null ? (
                  <span key={`v${i}`} />
                ) : (
                  <button
                    key={d}
                    type="button"
                    disabled={deshabilitado(d)}
                    onClick={() => elegir(d)}
                    className={`grid h-8 place-items-center rounded-full text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none disabled:line-through ${
                      mismoDia(seleccionada, new Date(anio, mes, d))
                        ? 'bg-acento font-bold text-white'
                        : mismoDia(hoy, new Date(anio, mes, d))
                          ? 'font-bold text-acento-oscuro ring-1 ring-acento'
                          : 'text-tinta hover:bg-acento-suave'
                    }`}
                  >
                    {d}
                  </button>
                )
              )}
            </div>

            {seleccionada && (
              <div className="mt-3 border-t border-borde pt-3 text-right">
                <button
                  type="button"
                  onClick={() => { onChange?.({ target: { value: '' } }); setAbierto(false) }}
                  className="text-xs font-semibold text-gris transition-colors hover:text-tinta cursor-pointer"
                >
                  Borrar fecha
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
