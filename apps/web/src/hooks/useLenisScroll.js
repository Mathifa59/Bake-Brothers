import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Smooth scroll de toda la landing, atado al ticker de GSAP — patrón
// recomendado por GSAP para que ScrollTrigger lea la posición de Lenis en
// vez de la del scroll nativo (si no, el pin/scrub queda un paso atrás y se
// siente con lag). Desactivado a propósito si el usuario pide menos
// movimiento: ahí el scroll nativo del navegador ya es lo esperado.
export function useLenisScroll(activo) {
  useEffect(() => {
    if (!activo) return undefined

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)

    const tick = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [activo])
}
