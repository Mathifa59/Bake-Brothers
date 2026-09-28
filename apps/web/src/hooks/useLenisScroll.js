import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Instancia compartida, para que otros componentes (ej. "volver arriba" del
// logo del footer) puedan pedirle un scroll animado sin necesitar contexto
// de React de por medio — solo existe mientras el hook está montado.
let lenisInstance = null

// Smooth scroll de toda la landing, atado al ticker de GSAP — patrón
// recomendado por GSAP para que ScrollTrigger lea la posición de Lenis en
// vez de la del scroll nativo (si no, el pin/scrub queda un paso atrás y se
// siente con lag). Desactivado a propósito si el usuario pide menos
// movimiento: ahí el scroll nativo del navegador ya es lo esperado.
export function useLenisScroll(activo) {
  useEffect(() => {
    if (!activo) return undefined

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
    lenisInstance = lenis
    lenis.on('scroll', ScrollTrigger.update)

    const tick = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenisInstance = null
    }
  }, [activo])
}

// Con Lenis activo, un window.scrollTo/scrollIntoView nativo pelea contra
// su loop de animación (Lenis lo pisa en el siguiente frame) — hay que
// pedirle el scroll a Lenis mismo. Sin Lenis (prefers-reduced-motion), cae
// al scroll nativo del navegador. `target` acepta 0/un número (posición
// absoluta) o un selector CSS (Lenis resuelve el elemento y calcula su
// posición solo).
export function scrollTo(target) {
  if (lenisInstance) {
    // force:true real: sin él, `scrollTo` no arranca si Lenis quedó
    // "stopped"/"locked" en ese instante — probado real con y sin la
    // opción, no agregado a ciegas.
    lenisInstance.scrollTo(target, { duration: 1.2, force: true })
  } else if (typeof target === 'string') {
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' })
  } else {
    window.scrollTo({ top: target, behavior: 'smooth' })
  }
}

export function scrollToTop() {
  scrollTo(0)
}
