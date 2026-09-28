import { MapPin, Navigation } from 'lucide-react'
import { locales } from '../../config/landing'

export default function Ubicaciones() {
  return (
    <section className="bg-crema px-6 py-20 sm:px-12 sm:py-28 lg:px-20">
      <div className="mb-10">
        <h2 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Nuestros locales</h2>
        <p className="mt-3 max-w-md text-gris">Visítanos o pide para recojo en cualquiera de las dos sedes.</p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        {locales.map((local) => (
          <div key={local.nombre} className="overflow-hidden rounded-[28px] bg-white shadow-md">
            {/* Tarjeta estática en vez del mapa embebido de Google: el
                iframe (con o sin API key) siempre trae un elemento propio de
                Google encima — a esta altura de tarjeta, un botón "Abrir en
                Maps" comprimido y feo; más alto, a veces una tarjeta
                completa, pero no de forma consistente en todos los tamaños
                de pantalla (verificado real, no es controlable desde acá,
                es contenido de google.com). El botón de abajo lleva a la
                ubicación real en Google Maps — mismo destino, sin ningún
                elemento ajeno flotando encima. */}
            <div className="flex h-40 items-center justify-center bg-acento-suave">
              <MapPin size={40} strokeWidth={1.5} className="text-acento" />
            </div>
            <div className="p-5">
              <p className="font-display text-lg font-semibold text-tinta">{local.nombre}</p>
              <p className="mt-1 text-sm text-gris">{local.direccion}</p>
              <a
                href={local.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85"
              >
                <Navigation size={15} />
                Cómo llegar
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
