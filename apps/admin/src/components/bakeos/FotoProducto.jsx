import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'

// Dónde viven las fotos antiguas (rutas relativas como «/img/catalogo/x.png», guardadas antes de usar Supabase Storage):
// en la web pública. El panel las pedía a su propio dominio y daba 404. Las fotos nuevas son URL completas de Storage.
const SITIO_PUBLICO = (import.meta.env.VITE_SITIO_URL || 'https://www.bakebrothers.pe').replace(/\/$/, '')

/** Direcciones a probar, en orden, para una foto guardada (la primera que cargue gana). */
export function candidatasDeFoto(url) {
  if (!url) return []
  if (/^(https?:|blob:|data:)/i.test(url)) return [url]
  const ruta = url.startsWith('/') ? url : `/${url}`
  const base = ruta.split('/').pop().replace(/\.[a-z0-9]+$/i, '')
  // La web tiene copias livianas (webp de 780 px) de la mayoría; las demás se piden tal cual.
  return [`${SITIO_PUBLICO}/img/menu/${base}.webp`, `${SITIO_PUBLICO}${ruta}`]
}

/**
 * Foto de un producto, combo o ítem de catering. Si no hay foto o ninguna dirección carga, muestra un ícono por defecto
 * (nunca el texto alternativo cortado del navegador).
 */
export default function FotoProducto({ url, nombre, className = 'h-11 w-11' }) {
  const candidatas = candidatasDeFoto(url)
  const [intento, setIntento] = useState(0)
  useEffect(() => setIntento(0), [url])

  if (!candidatas.length || intento >= candidatas.length) {
    return (
      <div
        role="img"
        aria-label={`${nombre ?? 'Producto'}: sin foto`}
        className={`grid shrink-0 place-items-center rounded-lg bg-borde/50 text-gris ${className}`}
      >
        <ImageOff size={18} aria-hidden="true" />
      </div>
    )
  }
  return (
    <img
      src={candidatas[intento]}
      alt=""
      loading="lazy"
      onError={() => setIntento((i) => i + 1)}
      className={`shrink-0 rounded-lg bg-borde/30 object-cover ${className}`}
    />
  )
}
