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
//
// Sin `loading="lazy"` a propósito, y sin esperar a que la sección esté
// cerca de la pantalla: el iframe de Google Maps demora en armar su propio
// mapa/tiles, y un margen de "precarga" todavía dejaba verlo cargando al
// llegar (pedido real del cliente: "que vaya cargando desde antes... que al
// bajar ya estén así"). El `src` se asigna directo al montar la página —
// mientras el usuario ve el hero y la galería de empanadas más arriba, los
// dos mapas ya se están armando de fondo, con todo ese scroll de sobra como
// margen.
export default function Ubicaciones() {
  return (
    <section className="bg-crema px-6 py-16 sm:px-12 sm:py-20 lg:px-20">
      <div className="mb-10">
        <h1 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Nuestros locales</h1>
        <p className="mt-3 max-w-md text-gris">Visítanos o pide para recojo en cualquiera de las dos sedes.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {locales.map((local) => (
          <div key={local.nombre} className="overflow-hidden rounded-[28px] bg-white shadow-md">
            <iframe
              title={`Mapa de Bake Brothers ${local.nombre}`}
              src={local.mapaSrc}
              className="h-[420px] w-full border-0"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
