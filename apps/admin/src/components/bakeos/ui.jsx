import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAhora } from '../../lib/datos'
import { fechaPortada } from '../../utils/formato'

/** Tarjeta base: fondo #FFFEFA con borde fino, como las del prototipo. */
export function Tarjeta({ className = '', children, ...resto }) {
  return (
    <div className={`rounded-2xl border border-borde bg-hueso p-4 ${className}`} {...resto}>
      {children}
    </div>
  )
}

/** Tarjeta destacada (hero): marrón casi negro con texto claro. */
export function Hero({ className = '', children }) {
  return <div className={`rounded-3xl bg-hero p-5 text-white ${className}`}>{children}</div>
}

const TONOS_PILL = {
  neutro: 'bg-borde/70 text-gris',
  ok: 'bg-ok-suave text-ok',
  lila: 'bg-lila-suave text-lila',
  prioridad: 'bg-acento-suave text-acento-oscuro',
}

/** Pill de estado: verde (normal), lila (reponer), melocotón (prioridad). */
export function Pill({ tono = 'neutro', className = '', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${TONOS_PILL[tono]} ${className}`}>
      {children}
    </span>
  )
}

const TONOS_ICONO = {
  naranja: 'bg-acento-suave text-acento-oscuro',
  lila: 'bg-lila-suave text-lila',
  verde: 'bg-ok-suave text-ok',
  azul: 'bg-sky-100 text-sky-700',
}

/** Tarjeta de KPI: ícono en cuadrado suave, etiqueta en mayúsculas chicas, valor grande y detalle. */
export function Kpi({ icono: Icono, tono = 'naranja', etiqueta, valor, detalle }) {
  return (
    <Tarjeta className="flex flex-col gap-2.5 p-3.5">
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONOS_ICONO[tono]}`}>
          <Icono size={18} aria-hidden="true" />
        </span>
        <span className="text-[10.5px] font-bold uppercase leading-tight tracking-wide text-gris">{etiqueta}</span>
      </div>
      <div className="text-2xl font-bold leading-none tracking-tight">{valor}</div>
      {detalle && <div className="text-xs leading-snug text-gris">{detalle}</div>}
    </Tarjeta>
  )
}

/** Portada de cada sección: fecha en hora de Lima (naranja), título grande, subtítulo y "Acción rápida" (nuevo pedido). */
export function Portada({ titulo, subtitulo, accion = true, children }) {
  const ahora = useAhora(30_000)
  return (
    <section className="pb-1 pt-5">
      <p className="text-[11px] font-bold tracking-wider text-acento-oscuro">{fechaPortada(ahora)}</p>
      <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-tight">{titulo}</h1>
      {subtitulo && <p className="mt-1 text-sm text-gris">{subtitulo}</p>}
      {accion && (
        <Link
          to="/nuevo-pedido"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-tinta px-4 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} aria-hidden="true" />
          Acción rápida
        </Link>
      )}
      {children}
    </section>
  )
}

/** Encabezado de un bloque dentro de una tarjeta: etiqueta chica en mayúsculas + título. */
export function EncabezadoBloque({ etiqueta, titulo, derecha }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-gris">{etiqueta}</p>
        {titulo && <h2 className="mt-1 text-base font-semibold leading-snug">{titulo}</h2>}
      </div>
      {derecha}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }) {
  return <p className="py-10 text-center text-sm text-gris">{texto}</p>
}

export function ErrorCarga({ mensaje }) {
  return (
    <p role="alert" className="my-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
      No se pudo cargar: {mensaje}
    </p>
  )
}
