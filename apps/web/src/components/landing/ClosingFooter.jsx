import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Facebook, Instagram, MapPin, MessageCircle } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'
import { locales, redes, mensajeWhatsappGenerico } from '../../config/landing'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { scrollToTop } from '../../hooks/useLenisScroll'

gsap.registerPlugin(ScrollTrigger)

// Cierre mínimo a propósito (pedido explícito: "que no compita con el
// CTA") — un solo reveal simple al entrar en pantalla, nada de pin ni
// scrub acá, la sección no lo necesita.
//
// onVisibilidadCambia: este footer ya trae su propio botón grande de
// WhatsApp — el flotante se oculta mientras el footer está en pantalla
// para no mostrar dos botones de WhatsApp a la vez (mismo patrón que ya
// usa VideosHero.jsx para su propio CTA).
export default function ClosingFooter({ onVisibilidadCambia }) {
  const reducido = usePrefersReducedMotion()
  const seccionRef = useRef(null)

  useGSAP(
    () => {
      const seccion = seccionRef.current
      const observer = new IntersectionObserver(([entry]) => onVisibilidadCambia?.(entry.isIntersecting), {
        threshold: 0.15,
      })
      if (seccion) observer.observe(seccion)

      if (reducido) return () => observer.disconnect()

      gsap.from('[data-cierre-reveal]', {
        opacity: 0,
        y: 24,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: seccion, start: 'top 75%' },
      })

      return () => observer.disconnect()
    },
    { scope: seccionRef, dependencies: [reducido] }
  )

  return (
    <footer ref={seccionRef} className="bg-tinta px-6 py-14 text-white sm:px-12 sm:py-16">
      {/* Mobile/tablet: todo centrado y apilado, como antes. Desktop
          (lg+): footer convencional de dos columnas — marca+CTA a la
          izquierda, contacto a la derecha, separadas por una raya vertical
          (a pedido del cliente, "como un footer convencional") en vez de
          la raya horizontal apilada de antes. */}
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center gap-10 text-center lg:flex-row lg:items-stretch lg:justify-between lg:gap-12 lg:text-left">
          <div data-cierre-reveal className="lg:flex-1">
            <button
              type="button"
              onClick={scrollToTop}
              aria-label="Volver arriba"
              className="mx-auto block transition-opacity hover:opacity-80 lg:mx-0"
            >
              <img
                src="/img/logo-landing-blanco.png"
                alt="Bake Brothers"
                loading="lazy"
                width={200}
                height={113}
                className="h-16 w-auto sm:h-20"
              />
            </button>

            <h2 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl">¿Se te antojó?</h2>
            <p className="mt-1 font-display text-xl text-white/85 sm:text-2xl">Escríbenos por WhatsApp</p>

            <WhatsAppCTA
              mensaje={mensajeWhatsappGenerico}
              producto="cierre"
              className="mt-6 inline-flex items-center gap-3 rounded-full bg-[#0F7B3F] px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-[#0F7B3F]/30 transition-transform hover:scale-105 active:scale-95 sm:px-9 sm:py-4"
            >
              <MessageCircle size={20} fill="white" className="text-[#0F7B3F]" />
              Pedir por WhatsApp
            </WhatsAppCTA>
          </div>

          {/* La "raya": horizontal apilada en mobile, vertical entre columnas en desktop. */}
          <div
            aria-hidden="true"
            className="w-full border-t border-white/10 lg:w-px lg:self-stretch lg:border-l lg:border-t-0"
          />

          <div data-cierre-reveal className="text-sm text-white/55 lg:flex-1">
            <div className="flex items-center justify-center gap-4 lg:justify-start">
              <a
                href={redes.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Bake Brothers en Instagram"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
              >
                <Instagram size={16} strokeWidth={1.75} />
              </a>
              <a
                href={redes.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Bake Brothers en Facebook"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
              >
                <Facebook size={16} strokeWidth={1.75} />
              </a>
              <span className="font-semibold tracking-wide text-white/70">{redes.handle}</span>
            </div>

            {/* Accesos rápidos a las otras páginas — antes eran anclas de
                scroll dentro de la misma vista; con el sitio de varias
                páginas pasan a ser navegación real (el header ya cubre esto
                también, este es solo un atajo extra desde el footer). */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <Link
                to="/menu"
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/40 hover:text-white"
              >
                Ver el menú
              </Link>
              <Link
                to="/locales"
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/40 hover:text-white"
              >
                Nuestros locales
              </Link>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:justify-center sm:gap-10 lg:flex-col lg:items-start lg:gap-1.5">
              {locales.map((local) => (
                <p key={local.nombre} className="flex items-start justify-center gap-1.5 sm:items-center lg:justify-start">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-white/40 sm:mt-0" />
                  <span>
                    <span className="font-semibold text-white/75">{local.nombre}:</span> {local.direccion}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Pie de ancho completo, centrado bajo las dos columnas — separado
            a propósito del contacto (que sigue alineado a la izquierda en
            desktop), pedido explícito del cliente. */}
        <p className="mt-10 text-center text-xs text-white/35">
          Desarrollado por{' '}
          <a
            href="https://www.devhorses.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white/50 transition-colors hover:text-white/80"
          >
            DevHorses
          </a>
        </p>
      </div>
    </footer>
  )
}
