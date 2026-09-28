import { locales } from '../../config/landing'

// Embed de Google Maps sin API key (el mismo que da "Compartir > Insertar
// mapa" en Google Maps) — no hace falta credenciales para esto.
// La dirección de Cedros ya trae "Chorrillos" adentro y la de Santa Marina
// no — se agrega el distrito solo cuando falta, para no duplicarlo en la
// consulta.
const mapaDe = (direccion) => {
  const consulta = direccion.includes('Chorrillos') ? `${direccion}, Lima, Perú` : `${direccion}, Chorrillos, Lima, Perú`
  return `https://www.google.com/maps?q=${encodeURIComponent(consulta)}&output=embed`
}

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
            <iframe
              title={`Mapa de Bake Brothers ${local.nombre}`}
              src={mapaDe(local.direccion)}
              className="h-64 w-full border-0 sm:h-72"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="p-5">
              <p className="font-display text-lg font-semibold text-tinta">{local.nombre}</p>
              <p className="mt-1 text-sm text-gris">{local.direccion}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
