import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from '../components/landing/Header'
import ClosingFooter from '../components/landing/ClosingFooter'
import WhatsAppFloatButton from '../components/landing/WhatsAppFloatButton'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useLenisScroll, resetScrollInstant } from '../hooks/useLenisScroll'

// Chrome compartido por las 3 páginas (Inicio/Menú/Locales) — header, footer
// y botón flotante se montan una sola vez acá, no por página, así Lenis no
// se reinicia entre rutas y el estado "¿el footer está en pantalla?" vive en
// un solo lugar. `<Outlet context>` pasa `setHeroEnPantalla` para que el
// Home (única página con hero propio) pueda apagar el flotante mientras su
// CTA está a la vista, igual que ya hacía antes del replanteo a varias
// páginas.
export default function Layout() {
  const reducido = usePrefersReducedMotion()
  useLenisScroll(!reducido)
  const location = useLocation()
  const [heroEnPantalla, setHeroEnPantalla] = useState(false)
  const [footerEnPantalla, setFooterEnPantalla] = useState(false)

  // Reset instantáneo al cambiar de página — un cambio de ruta debe
  // aparecer arriba de inmediato (ver resetScrollInstant en
  // useLenisScroll.js, distinto del scroll animado que usa "volver arriba").
  useEffect(() => {
    resetScrollInstant()
    setHeroEnPantalla(false)
  }, [location.pathname])

  return (
    <div className="bg-crema">
      <Header />
      <Outlet context={{ setHeroEnPantalla }} />
      <ClosingFooter onVisibilidadCambia={setFooterEnPantalla} />
      <WhatsAppFloatButton oculto={heroEnPantalla || footerEnPantalla} />
    </div>
  )
}
