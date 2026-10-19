import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { videosHero } from '../../config/landing'
import WhatsAppCTA from './WhatsAppCTA'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

const SEGUNDOS_POR_VIDEO = 6

function manejarLoopManual(evento) {
  const video = evento.currentTarget
  if (video.duration && video.currentTime >= video.duration - 0.15) video.currentTime = 0
}

function ProductoOverlay({ producto, activo }) {
  return (
    <div className="page-container relative z-10 flex h-full flex-col justify-center pb-28 pt-10 text-white sm:pb-32">
      <div key={activo ? 'visible' : 'oculto'} className={activo ? 'hero-copy' : undefined}>
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.25em] text-white/85 sm:text-xs">
          Bake Brothers <span className="mx-2 text-acento" aria-hidden="true">·</span> Chorrillos
        </p>
        <h2 aria-label={producto.nombre} className="max-w-[44rem] font-display text-[clamp(2rem,10vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[clamp(2.5rem,5.2vw,4.5rem)]">
          <span className="block">{producto.tituloPrincipal}</span>
          <span className="block">{producto.tituloSecundario} <span className="text-acento">{producto.tituloAcento}</span></span>
        </h2>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-white/90 sm:max-w-md sm:text-lg">
          {producto.subtitulo}
        </p>
        <div className="mt-6 sm:mt-7">
          <p className="text-sm font-medium text-white/85">Caja de {producto.unidades} unidades</p>
          <p className="mt-1 font-sans text-4xl font-bold tracking-tight sm:text-[2.75rem]">
            <span className="mr-1.5 text-xl font-medium text-white/85">S/</span>{producto.precio.toFixed(2)}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4 sm:mt-6">
          <WhatsAppCTA
            mensaje={producto.mensajeWhatsapp}
            producto={producto.id}
            ariaLabel={`Pedir ${producto.nombre} por WhatsApp`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0F7B3F] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-black/20 transition-colors hover:bg-[#096331] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acento sm:px-7 sm:text-base"
          >
            <MessageCircle size={18} aria-hidden="true" />
            Pídelo por WhatsApp
          </WhatsAppCTA>
          <Link to="/menu" className="inline-flex min-h-11 items-center gap-2 border-b border-white/45 py-2 text-sm font-semibold text-white transition-colors hover:border-acento hover:text-acento focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acento">
            Ver todo el menú <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function VideosHero({ onVisibilidadCambia }) {
  const reducido = usePrefersReducedMotion()
  const sectionRef = useRef(null)
  const videoRefs = useRef([])
  const [activa, setActiva] = useState(0)
  const [enPantalla, setEnPantalla] = useState(false)
  const [pestanaVisible, setPestanaVisible] = useState(() => !document.hidden)
  const [interactuando, setInteractuando] = useState(false)
  const [conFoco, setConFoco] = useState(false)
  const reproducir = enPantalla && pestanaVisible && !reducido

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setEnPantalla(entry.isIntersecting)
      onVisibilidadCambia?.(entry.isIntersecting)
    }, { threshold: 0.1 })
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [onVisibilidadCambia])

  useEffect(() => {
    const actualizar = () => setPestanaVisible(!document.hidden)
    document.addEventListener('visibilitychange', actualizar)
    return () => document.removeEventListener('visibilitychange', actualizar)
  }, [])

  useEffect(() => {
    videoRefs.current.forEach((video, indice) => {
      if (!video) return
      if (indice === activa && reproducir) video.play()?.catch(() => {})
      else video.pause()
    })
  }, [activa, reproducir])

  // La rotación se detiene mientras se lee o se enfoca un enlace de compra.
  useEffect(() => {
    if (!reproducir || interactuando || conFoco) return undefined
    const intervalo = setInterval(() => setActiva((actual) => (actual + 1) % videosHero.length), SEGUNDOS_POR_VIDEO * 1000)
    return () => clearInterval(intervalo)
  }, [activa, reproducir, interactuando, conFoco])

  return (
    <section
      id="alfajores"
      ref={sectionRef}
      role="region"
      aria-roledescription="carrusel"
      aria-label="Productos destacados"
      onMouseEnter={() => setInteractuando(true)}
      onMouseLeave={() => setInteractuando(false)}
      onFocusCapture={() => setConFoco(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setConFoco(false) }}
      className="hero-section relative isolate h-[calc(100svh-4rem)] min-h-[640px] w-full overflow-hidden bg-tinta sm:h-[calc(100svh-5rem)] sm:min-h-[600px] lg:min-h-[560px]"
    >
      {videosHero.map((producto, indice) => (
        <div
          key={producto.id}
          role="group"
          aria-roledescription="diapositiva"
          aria-label={`${indice + 1} de ${videosHero.length}`}
          aria-hidden={indice !== activa}
          inert={indice !== activa ? '' : undefined}
          className={`absolute inset-0 isolate transition-opacity duration-700 motion-reduce:transition-none ${indice === activa ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
        >
          <video
            ref={(elemento) => { videoRefs.current[indice] = elemento }}
            muted
            playsInline
            preload={indice === 0 ? 'auto' : 'metadata'}
            poster={producto.video.poster}
            aria-hidden="true"
            onTimeUpdate={manejarLoopManual}
            onEnded={(evento) => {
              evento.currentTarget.currentTime = 0
              if (indice === activa && reproducir) evento.currentTarget.play()?.catch(() => {})
            }}
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src={producto.video.webm} type="video/webm" />
            <source src={producto.video.mp4} type="video/mp4" />
          </video>
          <div className="hero-shade pointer-events-none absolute inset-0" />
          <ProductoOverlay producto={producto} activo={indice === activa} />
        </div>
      ))}

      <div className="page-container pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-end sm:bottom-7">
        <span className="hidden text-xs font-medium tracking-wider text-white/75 sm:block" aria-hidden="true">
          {String(activa + 1).padStart(2, '0')} <span className="mx-2 text-white/35">/</span> {String(videosHero.length).padStart(2, '0')}
        </span>
      </div>
    </section>
  )
}
