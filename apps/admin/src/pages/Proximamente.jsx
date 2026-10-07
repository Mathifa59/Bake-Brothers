import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { SECCIONES_PROXIMAMENTE } from '../config/secciones'
import { Hero, Pill, Portada, Tarjeta, EncabezadoBloque } from '../components/bakeos/ui'

/**
 * Sección del prototipo que necesita información del cliente antes de poder
 * construirse. Sin datos de ejemplo: solo qué hará y QUÉ falta para armarla.
 */
export default function Proximamente() {
  const { pathname } = useLocation()
  const s = SECCIONES_PROXIMAMENTE.find((x) => x.ruta === pathname)
  if (!s) return null
  const Icono = s.icono

  return (
    <>
      <Portada titulo={s.etiqueta} subtitulo={s.subtitulo} />
      <Hero className="mt-5">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-white/20 text-acento">
          <Icono size={22} aria-hidden="true" />
        </span>
        <div className="mt-4">
          <Pill tono="prioridad">Próximamente</Pill>
        </div>
        <h2 className="mt-4 text-xl font-semibold leading-snug">{s.descripcion}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Esta sección todavía no tiene datos reales, así que no muestra ninguno de ejemplo.
        </p>
      </Hero>
      <Tarjeta className="mt-4 p-4">
        <EncabezadoBloque etiqueta="Para construirla necesitamos" derecha={<Hammer size={16} className="text-gris" aria-hidden="true" />} />
        <p className="text-sm leading-relaxed">{s.necesita}</p>
      </Tarjeta>
    </>
  )
}
