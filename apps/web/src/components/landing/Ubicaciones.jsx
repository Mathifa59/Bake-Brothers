import { useEffect, useRef, useState } from 'react'
import { locales } from '../../config/landing'

// Altura generosa a propósito: con el alto "de tarjeta" que se usaba antes
// (256-288px), Google comprime su propia tarjeta de info a un botón chico
// "Abrir en Maps" en vez de la tarjeta completa (nombre, dirección, botón de
// direcciones) — pedido explícito del cliente con un ejemplo real de cómo se
// ve la tarjeta completa. Esa tarjeta completa depende del ANCHO además del
// alto (verificado real): a 411px de columna con este alto entra bien, pero
// a ~350px (lo que daría un `sm:grid-cols-2` en tablet, dos columnas
// angostas) Google vuelve a mostrar el botón chico. Por eso el grid pasa a
// dos columnas recién en `lg` (1024px+, columna ~410px+) — antes de eso
// (mobile Y tablet) es una sola columna a todo el ancho, siempre con margen
// de sobra.
export default function Ubicaciones() {
  const seccionRef = useRef(null)
  // El iframe de Google Maps demora en cargar de verdad (arma su propio
  // mapa/tiles) — con `loading="lazy"` nativo, el navegador recién empieza a
  // pedirlo cuando la sección está a punto de entrar en pantalla, así que se
  // ve cargando varios segundos justo cuando el usuario llega a mirarlo.
  // Con este IntersectionObserver (rootMargin generoso) el `src` real se
  // asigna mientras la sección todavía está bastante más abajo —
  // normalmente ya terminó de cargar para cuando el usuario scrollea hasta
  // acá. Sigue sin cargar si el usuario nunca llega a esta parte de la
  // página.
  const [cargarMapas, setCargarMapas] = useState(false)

  useEffect(() => {
    if (cargarMapas) return undefined
    const seccion = seccionRef.current
    if (!seccion) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setCargarMapas(true)
      },
      { rootMargin: '1200px 0px' }
    )
    observer.observe(seccion)
    return () => observer.disconnect()
  }, [cargarMapas])

  return (
    <section ref={seccionRef} className="bg-crema px-6 py-20 sm:px-12 sm:py-28 lg:px-20">
      <div className="mb-10">
        <h2 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Nuestros locales</h2>
        <p className="mt-3 max-w-md text-gris">Visítanos o pide para recojo en cualquiera de las dos sedes.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {locales.map((local) => (
          <div key={local.nombre} className="overflow-hidden rounded-[28px] bg-white shadow-md">
            <iframe
              title={`Mapa de Bake Brothers ${local.nombre}`}
              src={cargarMapas ? local.mapaSrc : undefined}
              className="h-[420px] w-full border-0"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
