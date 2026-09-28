import { useEffect, useState } from 'react'

// La landing tiene pin/scrub/stagger elaborados — quien pida menos
// movimiento (por accesibilidad o por mareo con animaciones grandes) tiene
// que recibir una versión simple, sin pin ni scroll-scrub, en vez de que
// se lo forcemos igual.
export function usePrefersReducedMotion() {
  const [reducido, setReducido] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducido(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reducido
}
