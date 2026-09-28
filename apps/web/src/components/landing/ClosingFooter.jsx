import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Facebook, Instagram, MapPin, MessageCircle } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'
import { locales, redes, mensajeWhatsappGenerico } from '../../config/landing'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

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
    // El padding vertical era mucho más grande (pb-32/pt-24, sm:py-32) para
    // que el botón flotante de WhatsApp no tapara la última dirección —
    // ya no hace falta, el flotante se oculta solo mientras este footer
    // está en pantalla (ver onVisibilidadCambia). Bug real encontrado con
    // ese padding viejo: en una ventana de ~768px de alto (laptop común),
    // el footer completo medía ~789px — más que la pantalla — así que al
    // llegar al final real del scroll, su borde superior quedaba cortado
    // por el límite de la ventana (reportado por el cliente, confirmado
    // midiendo scrollY contra la altura real del documento: coincidían
    // exacto, no había "espacio fantasma", el footer solo no entraba
    // entero). Con este padding más ajustado entra cómodo.
    <footer ref={seccionRef} className="bg-tinta px-6 py-20 text-center text-white sm:px-12 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <img
          src="/img/logo-landing-blanco.png"
          alt="Bake Brothers"
          data-cierre-reveal
          loading="lazy"
          width={200}
          height={113}
          className="mx-auto h-14 w-auto sm:h-16"
        />

        <h2 data-cierre-reveal className="mt-8 font-display text-4xl font-semibold leading-tight sm:text-5xl">
          ¿Se te antojó?
        </h2>
        <p data-cierre-reveal className="mt-1 font-display text-2xl text-white/85 sm:text-3xl">
          Escríbenos por WhatsApp
        </p>

        <div data-cierre-reveal>
          <WhatsAppCTA
            mensaje={mensajeWhatsappGenerico}
            producto="cierre"
            className="mt-9 inline-flex items-center gap-3 rounded-full bg-[#0F7B3F] px-9 py-4 text-base font-bold text-white shadow-xl shadow-[#0F7B3F]/30 transition-transform hover:scale-105 active:scale-95 sm:px-10 sm:py-5 sm:text-lg"
          >
            <MessageCircle size={22} fill="white" className="text-[#0F7B3F]" />
            Pedir por WhatsApp
          </WhatsAppCTA>
        </div>

        <div data-cierre-reveal className="mx-auto mt-12 max-w-md border-t border-white/10 pt-8 text-sm text-white/55">
          <div className="flex items-center justify-center gap-4">
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
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center sm:gap-10">
            {locales.map((local) => (
              <p key={local.nombre} className="flex items-start justify-center gap-1.5 sm:items-center">
                <MapPin size={14} className="mt-0.5 shrink-0 text-white/40 sm:mt-0" />
                <span>
                  <span className="font-semibold text-white/75">{local.nombre}:</span> {local.direccion}
                </span>
              </p>
            ))}
          </div>
        </div>

        <p data-cierre-reveal className="mt-6 text-xs text-white/35">
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
