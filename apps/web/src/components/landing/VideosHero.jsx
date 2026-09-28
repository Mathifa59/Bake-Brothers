import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { videosHero } from '../../config/landing'
import WhatsAppCTA from './WhatsAppCTA'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

gsap.registerPlugin(SplitText)

const SEGUNDOS_POR_VIDEO = 6

// El loop se maneja a mano, sin el atributo `loop` — reporte real: los
// clips duran 8-10s, alguien que se queda mirando el hero antes de bajar
// alcanza a ver el reinicio del loop, y en ese reinicio nativo algunos
// navegadores muestran un parpadeo/flash en blanco. Reiniciar un poco antes
// del final (en vez de esperar a que termine) evita ese corte.
function manejarLoopManual(evento) {
  const video = evento.currentTarget
  if (video.duration && video.currentTime >= video.duration - 0.15) {
    video.currentTime = 0
  }
}

function reiniciarAlTerminar(evento) {
  const video = evento.currentTarget
  video.currentTime = 0
  video.play()
}

function VideoBackground({ video, videoRef }) {
  // absolute inset-0: sin esto el <video> queda en el flujo normal del
  // documento (toma 768px reales de alto) y empuja al overlay de texto que
  // viene después fuera de la pantalla — el bug real que se vio al
  // verificar en el navegador, no algo hipotético.
  //
  // Sin fetchPriority acá a propósito: no es un atributo real de <video>
  // (solo de <img>/<link>/fetch), React tiraba un warning en cada render y
  // el navegador lo ignoraba de todas formas. El poster del primer video sí
  // se precarga con prioridad alta, pero eso vive en index.html.
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      preload="auto"
      poster={video.poster}
      onTimeUpdate={manejarLoopManual}
      onEnded={reiniciarAlTerminar}
      className="absolute inset-0 h-full w-full object-cover"
    >
      <source src={video.webm} type="video/webm" />
      <source src={video.mp4} type="video/mp4" />
    </video>
  )
}

function ProductoOverlay({ producto, contentRef, tituloRef, subtituloRef }) {
  return (
    <div
      ref={contentRef}
      className="relative z-10 flex h-full flex-col justify-end px-6 pb-24 text-white sm:px-12 sm:pb-28 lg:px-20"
    >
      <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.35em] text-white/80">Bake Brothers</p>
      <h2
        ref={tituloRef}
        className="max-w-2xl font-display text-4xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl"
      >
        {producto.nombre}
      </h2>
      {/* role="text": SplitText le inyecta un aria-label con el texto completo
          al hacer el reveal por líneas — un <p> normal no acepta nombre por
          aria-label según ARIA-in-HTML (hallado por Lighthouse), role="text"
          es la corrección recomendada por la propia documentación de GSAP. */}
      <p
        ref={subtituloRef}
        role="text"
        className="mt-4 max-w-md font-sans text-base text-white/85 sm:text-lg"
      >
        {producto.subtitulo}
      </p>
      <div data-hero-cta className="mt-7 flex flex-wrap items-center gap-5">
        <span className="font-display text-2xl font-semibold sm:text-3xl">
          S/ {producto.precio.toFixed(2)} · {producto.unidades} unidades
        </span>
        <WhatsAppCTA
          mensaje={producto.mensajeWhatsapp}
          producto={producto.id}
          className="rounded-full bg-[#0F7B3F] px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-black/25 transition-transform hover:scale-105 active:scale-95 sm:text-base"
        >
          Pídelo por WhatsApp
        </WhatsAppCTA>
      </div>
    </div>
  )
}

// Sección 1+2 de la landing, construidas juntas a propósito. El cambio
// entre videos es automático (por tiempo), NO depende del scroll — pedido
// real del cliente: la mecánica anterior (pin + scroll-scrub) obligaba a
// scrollear para ver el segundo video, y no lo quería así. El scroll acá
// ahora es 100% libre, como cualquier otra sección — solo baja la página.
//
// onVisibilidadCambia: cada video trae su propio CTA anclado abajo a la
// derecha, la misma esquina donde vive el botón flotante — sin esto se
// superponen. Landing.jsx lo usa para ocultar el flotante mientras esta
// sección está en pantalla (ya hay un CTA visible, no hace falta el
// segundo) y mostrarlo recién cuando el usuario sigue bajando.
export default function VideosHero({ onVisibilidadCambia }) {
  const reducido = usePrefersReducedMotion()
  const sectionRef = useRef(null)
  const layer1Ref = useRef(null)
  const layer2Ref = useRef(null)
  const video1Ref = useRef(null)
  const video2Ref = useRef(null)
  const contenido1Ref = useRef(null)
  const contenido2Ref = useRef(null)
  const titulo1Ref = useRef(null)
  const subtitulo1Ref = useRef(null)

  useGSAP(
    () => {
      // Reveal de entrada del primer video (por líneas, con máscara) — es
      // lo primero que ve cualquiera al abrir la página, corre una sola vez
      // al montar, no depende del scroll.
      const splitTitulo = SplitText.create(titulo1Ref.current, { type: 'lines', mask: 'lines' })
      const splitSubtitulo = SplitText.create(subtitulo1Ref.current, { type: 'lines', mask: 'lines' })

      if (reducido) {
        // Sin auto-cambio ni reveal escalonado: el hero queda quieto en el
        // primer video (más simple y predecible para quien pidió menos
        // movimiento).
        gsap.set('[data-hero-cta]', { opacity: 1 })
        return undefined
      }

      gsap.set([splitTitulo.lines, splitSubtitulo.lines], { yPercent: 130 })
      gsap.set('[data-hero-cta]', { opacity: 0, y: 16 })
      gsap
        .timeline({ delay: 0.3 })
        .to(splitTitulo.lines, { yPercent: 0, duration: 1, stagger: 0.08, ease: 'expo.out' })
        .to(splitSubtitulo.lines, { yPercent: 0, duration: 0.8, stagger: 0.06, ease: 'expo.out' }, '-=0.6')
        .to('[data-hero-cta]', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.4')

      // Cross-fade automático entre los dos videos, cada SEGUNDOS_POR_VIDEO
      // segundos — mismo cross-fade simple de antes, solo que ahora lo
      // dispara un timer en vez del scroll. El timer se prende/apaga con la
      // visibilidad real de la sección (mismo IntersectionObserver que ya
      // pausaba los videos): ahorra trabajo de sobra y evita que el usuario
      // vuelva a la sección a mitad de una transición vieja.
      let mostrandoVideo1 = true
      const alternar = () => {
        const entra = mostrandoVideo1 ? layer2Ref.current : layer1Ref.current
        const sale = mostrandoVideo1 ? layer1Ref.current : layer2Ref.current
        const contenidoEntra = mostrandoVideo1 ? contenido2Ref.current : contenido1Ref.current
        const contenidoSale = mostrandoVideo1 ? contenido1Ref.current : contenido2Ref.current
        mostrandoVideo1 = !mostrandoVideo1

        gsap.to(contenidoSale, { opacity: 0, yPercent: -8, duration: 0.4, ease: 'power1.in' })
        gsap.to(sale, { opacity: 0, duration: 0.6, ease: 'power1.inOut' })
        gsap.fromTo(entra, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.inOut' })
        gsap.fromTo(
          contenidoEntra,
          { opacity: 0, yPercent: 8 },
          { opacity: 1, yPercent: 0, duration: 0.4, ease: 'power1.out', delay: 0.25 }
        )
      }

      let intervaloId = null

      // Ahorro real de batería/datos: el video fuera de pantalla se pausa,
      // y el auto-cambio se detiene con él (IntersectionObserver, no un
      // listener de scroll a mano).
      const seccion = sectionRef.current
      const observer = new IntersectionObserver(
        ([entry]) => {
          const accion = entry.isIntersecting ? 'play' : 'pause'
          video1Ref.current?.[accion]?.()
          video2Ref.current?.[accion]?.()
          onVisibilidadCambia?.(entry.isIntersecting)

          if (entry.isIntersecting && intervaloId === null) {
            intervaloId = setInterval(alternar, SEGUNDOS_POR_VIDEO * 1000)
          } else if (!entry.isIntersecting && intervaloId !== null) {
            clearInterval(intervaloId)
            intervaloId = null
          }
        },
        { threshold: 0.1 }
      )
      if (seccion) observer.observe(seccion)

      return () => {
        observer.disconnect()
        if (intervaloId !== null) clearInterval(intervaloId)
      }
    },
    { scope: sectionRef, dependencies: [reducido] }
  )

  return (
    <section id="alfajores" ref={sectionRef} className="relative h-svh w-full overflow-hidden bg-tinta">
      <div ref={layer1Ref} className="absolute inset-0">
        <VideoBackground video={videosHero[0].video} videoRef={video1Ref} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/35" />
        <ProductoOverlay
          producto={videosHero[0]}
          contentRef={contenido1Ref}
          tituloRef={titulo1Ref}
          subtituloRef={subtitulo1Ref}
        />
      </div>

      <div ref={layer2Ref} className="absolute inset-0" style={{ opacity: 0 }}>
        <VideoBackground video={videosHero[1].video} videoRef={video2Ref} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/35" />
        <ProductoOverlay producto={videosHero[1]} contentRef={contenido2Ref} />
      </div>
    </section>
  )
}
