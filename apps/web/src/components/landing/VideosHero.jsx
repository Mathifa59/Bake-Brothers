import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { videosHero } from '../../config/landing'
import WhatsAppCTA from './WhatsAppCTA'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger, SplitText)

function VideoBackground({ video, videoRef, prioridad = 'auto' }) {
  // absolute inset-0: sin esto el <video> queda en el flujo normal del
  // documento (toma 768px reales de alto) y empuja al overlay de texto que
  // viene después fuera de la pantalla — el bug real que se vio al
  // verificar en el navegador, no algo hipotético.
  return (
    <video
      ref={videoRef}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      poster={video.poster}
      fetchPriority={prioridad}
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
      <div className="mt-7 flex flex-wrap items-center gap-5">
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

// Sección 1+2 de la landing, construidas juntas a propósito: el "momento
// wow" es la transición entre ambas, controlada por el mismo scroll que
// pinea el video 1 — no tiene sentido partirlas en dos componentes que
// después tendrían que coordinarse por fuera.
//
// onVisibilidadCambia: cada video trae su propio CTA anclado abajo a la
// derecha, la misma esquina donde vive el botón flotante — sin esto se
// superponen. Landing.jsx lo usa para ocultar el flotante mientras esta
// sección está en pantalla (ya hay un CTA visible, no hace falta el
// segundo) y mostrarlo recién cuando el usuario sigue bajando.
export default function VideosHero({ onVisibilidadCambia }) {
  const reducido = usePrefersReducedMotion()
  const sectionRef = useRef(null)
  const clipWrapperRef = useRef(null)
  const video1Ref = useRef(null)
  const video2Ref = useRef(null)
  const contenido1Ref = useRef(null)
  const contenido2Ref = useRef(null)
  const titulo1Ref = useRef(null)
  const subtitulo1Ref = useRef(null)

  useGSAP(
    () => {
      // Ahorro real de batería/datos: el video fuera de pantalla se pausa
      // (IntersectionObserver, no un listener de scroll a mano).
      const seccion = sectionRef.current
      const observer = new IntersectionObserver(
        ([entry]) => {
          const accion = entry.isIntersecting ? 'play' : 'pause'
          video1Ref.current?.[accion]?.()
          video2Ref.current?.[accion]?.()
          onVisibilidadCambia?.(entry.isIntersecting)
        },
        { threshold: 0.1 }
      )
      if (seccion) observer.observe(seccion)

      // Reveal de entrada del primer video (por líneas, con máscara) — es
      // lo primero que ve cualquiera al abrir la página, corre una sola vez
      // al montar, no depende del scroll.
      const splitTitulo = SplitText.create(titulo1Ref.current, { type: 'lines', mask: 'lines' })
      const splitSubtitulo = SplitText.create(subtitulo1Ref.current, { type: 'lines', mask: 'lines' })

      if (reducido) {
        // Sin pin, sin scrub, sin reveal escalonado: el segundo video queda
        // simplemente visible debajo, como cualquier sección normal.
        gsap.set(clipWrapperRef.current, { clipPath: 'circle(150% at 50% 50%)' })
        gsap.set(contenido2Ref.current, { opacity: 1 })
        gsap.set('[data-hero-cta]', { opacity: 1 })
        return () => observer.disconnect()
      }

      gsap.set([splitTitulo.lines, splitSubtitulo.lines], { yPercent: 130 })
      gsap.set('[data-hero-cta]', { opacity: 0, y: 16 })
      gsap
        .timeline({ delay: 0.3 })
        .to(splitTitulo.lines, { yPercent: 0, duration: 1, stagger: 0.08, ease: 'expo.out' })
        .to(splitSubtitulo.lines, { yPercent: 0, duration: 0.8, stagger: 0.06, ease: 'expo.out' }, '-=0.6')
        .to('[data-hero-cta]', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.4')

      // La transición: el video 1 queda pineado, el video 2 entra por
      // clip-path circular que se expande — todo atado al mismo scrub, así
      // que avanza y retrocede exactamente con el scroll, nunca "de golpe".
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: seccion,
          start: 'top top',
          end: '+=100%',
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      })
      tl.to(contenido1Ref.current, { opacity: 0, yPercent: -8, duration: 0.35, ease: 'power1.in' }, 0)
        .to(clipWrapperRef.current, { clipPath: 'circle(150% at 50% 50%)', duration: 1, ease: 'power2.inOut' }, 0.1)
        .fromTo(
          contenido2Ref.current,
          { opacity: 0, yPercent: 8 },
          { opacity: 1, yPercent: 0, duration: 0.35, ease: 'power1.out' },
          0.55
        )

      return () => observer.disconnect()
    },
    { scope: sectionRef, dependencies: [reducido] }
  )

  return (
    <section ref={sectionRef} className={`relative ${reducido ? '' : 'h-[220vh]'}`}>
      <div className="sticky top-0 h-svh w-full overflow-hidden bg-tinta">
        <div className="absolute inset-0">
          <VideoBackground video={videosHero[0].video} videoRef={video1Ref} prioridad="high" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/35" />
          <ProductoOverlay
            producto={videosHero[0]}
            contentRef={contenido1Ref}
            tituloRef={titulo1Ref}
            subtituloRef={subtitulo1Ref}
          />
        </div>

        <div ref={clipWrapperRef} className="absolute inset-0" style={{ clipPath: 'circle(0% at 50% 50%)' }}>
          <VideoBackground video={videosHero[1].video} videoRef={video2Ref} prioridad="low" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/35" />
          <ProductoOverlay producto={videosHero[1]} contentRef={contenido2Ref} />
        </div>
      </div>
    </section>
  )
}
