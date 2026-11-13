import { useEffect, useRef, useState } from 'react'

/**
 * Ancho real (en píxeles) de un contenedor, siguiendo sus cambios. Los gráficos SVG se dibujan con ESE ancho en vez de
 * escalar un `viewBox` fijo: con un `viewBox` el texto y las líneas crecen junto con la pantalla (a 1400 px las etiquetas
 * se veían gigantes y cortadas). Devuelve `[ref, ancho]`; `anchoInicial` se usa hasta la primera medición.
 */
export function useAncho(anchoInicial = 320) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(anchoInicial)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => setAncho(Math.max(160, Math.round(el.getBoundingClientRect().width)))
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])
  return [ref, ancho]
}
