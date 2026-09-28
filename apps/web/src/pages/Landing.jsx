import { useState } from 'react'
import VideosHero from '../components/landing/VideosHero'
import EmpanadasGallery from '../components/landing/EmpanadasGallery'
import Ubicaciones from '../components/landing/Ubicaciones'
import ClosingFooter from '../components/landing/ClosingFooter'
import WhatsAppFloatButton from '../components/landing/WhatsAppFloatButton'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useLenisScroll } from '../hooks/useLenisScroll'

export default function Landing() {
  const reducido = usePrefersReducedMotion()
  useLenisScroll(!reducido)
  // El hero y el footer ya traen su propio CTA de WhatsApp — el flotante se
  // oculta mientras cualquiera de los dos está en pantalla, para no mostrar
  // dos botones de WhatsApp a la vez (ver VideosHero.jsx/ClosingFooter.jsx).
  const [heroEnPantalla, setHeroEnPantalla] = useState(true)
  const [footerEnPantalla, setFooterEnPantalla] = useState(false)

  return (
    <div className="bg-crema">
      <VideosHero onVisibilidadCambia={setHeroEnPantalla} />
      <EmpanadasGallery />
      <Ubicaciones />
      <ClosingFooter onVisibilidadCambia={setFooterEnPantalla} />
      <WhatsAppFloatButton oculto={heroEnPantalla || footerEnPantalla} />
    </div>
  )
}
