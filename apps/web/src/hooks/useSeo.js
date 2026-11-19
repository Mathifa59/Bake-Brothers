import { useEffect } from 'react'
import { SEO, rutaNormalizada, urlCanonica } from '../config/seo'

/**
 * Pone la cabecera SEO de la ruta actual al navegar dentro del sitio (el HTML de cada ruta ya sale con la suya desde el
 * build; esto cubre el cambio de página sin recarga). Una ruta que no existe queda con noindex.
 */
export function useSeo(pathname) {
  useEffect(() => {
    const ruta = rutaNormalizada(pathname)
    const seo = SEO[ruta]
    const poner = (selector, atributo, valor) => document.head.querySelector(selector)?.setAttribute(atributo, valor)

    const titulo = seo?.titulo ?? 'Página no encontrada · Bake Brothers'
    const descripcion = seo?.descripcion ?? SEO['/'].descripcion
    document.title = titulo
    poner('meta[name="description"]', 'content', descripcion)
    poner('meta[property="og:title"]', 'content', titulo)
    poner('meta[property="og:description"]', 'content', descripcion)
    poner('meta[name="twitter:title"]', 'content', titulo)
    poner('meta[name="twitter:description"]', 'content', descripcion)
    if (seo) {
      poner('link[rel="canonical"]', 'href', urlCanonica(ruta))
      poner('meta[property="og:url"]', 'content', urlCanonica(ruta))
    }

    // noindex solo para lo que no es una página del sitio.
    let robots = document.head.querySelector('meta[name="robots"]')
    if (!seo) {
      if (!robots) {
        robots = document.createElement('meta')
        robots.setAttribute('name', 'robots')
        document.head.appendChild(robots)
      }
      robots.setAttribute('content', 'noindex')
    } else {
      robots?.remove()
    }
  }, [pathname])
}
