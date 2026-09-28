import { useState } from 'react'
import VideosHero from '../components/landing/VideosHero'
import EmpanadasGallery from '../components/landing/EmpanadasGallery'
import ClosingFooter from '../components/landing/ClosingFooter'
import WhatsAppFloatButton from '../components/landing/WhatsAppFloatButton'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useLenisScroll } from '../hooks/useLenisScroll'

export default function Landing() {
  const reducido = usePrefersReducedMotion()
  useLenisScroll(!reducido)
  // El hero ya trae su propio CTA anclado abajo a la derecha — el flotante
  // se oculta mientras esa sección está en pantalla para no taparlo (ver
  // VideosHero.jsx), y vuelve a aparecer apenas el usuario sigue bajando.
  const [heroEnPantalla, setHeroEnPantalla] = useState(true)

  return (
    <div className="bg-crema">
      <VideosHero onVisibilidadCambia={setHeroEnPantalla} />
      <EmpanadasGallery />
      <ClosingFooter />
      <WhatsAppFloatButton oculto={heroEnPantalla} />
    </div>
  )
}
