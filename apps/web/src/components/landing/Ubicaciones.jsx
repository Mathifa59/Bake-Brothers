import { ArrowUpRight, Clock3, MapPin } from 'lucide-react'
import { locales } from '../../config/landing'

export default function Ubicaciones() {
  return (
    <section className="page-container py-16 sm:py-20">
      <div className="mb-10">
        <h1 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Nuestros locales</h1>
        <p className="mt-3 max-w-md text-gris">Visítanos o pide para recojo en cualquiera de las dos sedes.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        {locales.map((local) => (
          <article key={local.nombre} className="flex flex-col overflow-hidden rounded-[28px] border border-borde/70 bg-white shadow-sm">
            <div className="flex flex-1 flex-col p-6 sm:p-8">
              <h2 className="font-display text-2xl font-semibold text-tinta sm:text-3xl">{local.nombre}</h2>
              <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-gris">
                <MapPin size={17} className="mt-0.5 shrink-0 text-acento-oscuro" aria-hidden="true" />
                {local.direccion}
              </p>
              <div className="mt-5 flex items-start gap-2 text-sm">
                <Clock3 size={17} className="mt-0.5 shrink-0 text-acento-oscuro" aria-hidden="true" />
                <dl className="flex-1 space-y-2">
                  {local.horarios.map((horario) => (
                    <div key={horario.dias} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <dt className="font-medium text-tinta">{horario.dias}</dt>
                      <dd className="text-gris">{horario.horas}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <a href={local.mapaUrl} target="_blank" rel="noopener noreferrer" aria-label={`Cómo llegar a ${local.nombre} en Google Maps`} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-tinta px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-tinta/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-acento-oscuro">
                Cómo llegar <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <iframe title={`Mapa de Bake Brothers ${local.nombre}`} src={local.mapaSrc} className="h-[420px] w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
          </article>
        ))}
      </div>
    </section>
  )
}
