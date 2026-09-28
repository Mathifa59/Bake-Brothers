import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MessageCircle } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'
import { locales, redes, mensajeWhatsappGenerico } from '../../config/landing'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

// Cierre mínimo a propósito (pedido explícito: "que no compita con el
// CTA") — un solo reveal simple al entrar en pantalla, nada de pin ni
// scrub acá, la sección no lo necesita.
export default function ClosingFooter() {
  const reducido = usePrefersReducedMotion()
  const seccionRef = useRef(null)

  useGSAP(
    () => {
      if (reducido) return
      gsap.from('[data-cierre-reveal]', {
        opacity: 0,
        y: 24,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: seccionRef.current, start: 'top 75%' },
      })
    },
    { scope: seccionRef, dependencies: [reducido] }
  )

  return (
    // pb más grande que pt en mobile a propósito: el botón flotante de
    // WhatsApp vive fijo en esa esquina — sin este aire de sobra, el texto
    // de la última dirección queda tapado por el botón (visto real en el
    // navegador, no hipotético).
    <footer ref={seccionRef} className="bg-tinta px-6 pb-32 pt-24 text-center text-white sm:px-12 sm:py-32">
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

        <div data-cierre-reveal className="mt-16 space-y-3 text-sm text-white/55">
          <a
            href={redes.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-semibold tracking-wide text-white/70 transition-colors hover:text-white"
          >
            {redes.handle}
          </a>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-center sm:gap-10">
            {locales.map((local) => (
              <p key={local.nombre}>
                <span className="font-semibold text-white/75">{local.nombre}:</span> {local.direccion}
              </p>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
