import { useState } from 'react'
import { Check, PartyPopper } from 'lucide-react'
import { paquetesCatering, formatoPrecio } from '../data/mock'
import SectionTitle from '../components/SectionTitle'
import Button from '../components/Button'
import Input from '../components/Input'

const tiposEvento = [
  'Cumpleaños', 'Matrimonio', 'Baby shower', 'Evento corporativo',
  'Aniversario', 'Reunión familiar', 'Otro',
]

export default function Catering() {
  const [enviado, setEnviado] = useState(false)
  const [form, setForm] = useState({
    nombre: '', telefono: '', tipoEvento: tiposEvento[0],
    fecha: '', personas: '', mensaje: '',
  })
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const enviar = (e) => {
    e.preventDefault()
    setEnviado(true)
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-puntos">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
          <div className="anim-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-acento/30 bg-acento-suave px-4 py-1.5 text-xs font-bold tracking-wide text-acento-oscuro">
              <PartyPopper size={13} /> Catering artesanal
            </span>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] md:text-6xl [text-wrap:balance]">
              Endulzamos y acompañamos
              <em className="font-light italic text-acento"> tus eventos</em>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-gris">
              Cotiza tu mesa dulce para cumpleaños, reuniones o eventos corporativos.
              Productos artesanales, montaje impecable y cero preocupaciones.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button tamano="lg" href="#cotizar" onClick={(e) => { e.preventDefault(); document.getElementById('cotizar')?.scrollIntoView({ behavior: 'smooth' }) }}>
                Solicitar cotización
              </Button>
              <Button tamano="lg" variante="secundario" to="/catalogo?tipo=Catering">
                Ver productos de catering
              </Button>
            </div>
          </div>
          <div className="anim-fade-up delay-2 relative mx-auto w-full max-w-md">
            <div className="overflow-hidden rounded-[3rem] shadow-2xl shadow-acento/20 ring-1 ring-borde">
              <img
                src="/img/mini-tartaletas-fruta.jpg"
                alt="Mesa dulce elegante con bocaditos artesanales"
                className="aspect-square w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -left-2 rotate-[-4deg] rounded-2xl bg-white px-5 py-3 shadow-lg ring-1 ring-borde">
              <p className="text-xs font-bold">🎉 +300 eventos endulzados</p>
            </div>
          </div>
        </div>
      </section>

      {/* Paquetes */}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionTitle
            centrado
            etiqueta="Paquetes"
            titulo="Elige el paquete perfecto para tu evento"
            descripcion="Todos incluyen coordinación de entrega y productos horneados el mismo día."
            className="mb-12"
          />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {paquetesCatering.map((paq) => (
              <article
                key={paq.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-borde/60 bg-hueso shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-tinta/8"
              >
                {paq.foto ? (
                  <div className="relative aspect-[5/3] overflow-hidden">
                    <img
                      src={paq.foto}
                      alt={paq.nombre}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  </div>
                ) : (
                  <div
                    className="grid aspect-[5/3] place-items-center"
                    style={{ background: `linear-gradient(140deg, ${paq.g[0]}, ${paq.g[1]})` }}
                    role="img"
                    aria-label={paq.nombre}
                  >
                    <span className="text-6xl drop-shadow-sm">{paq.emoji}</span>
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-xl font-semibold">{paq.nombre}</h3>
                  <p className="mt-1 text-sm text-gris">{paq.descripcion}</p>
                  <p className="mt-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-gris">Desde</span>
                    <span className="ml-2 text-2xl font-extrabold text-acento-oscuro">
                      {formatoPrecio(paq.desde)}
                    </span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2">
                    {paq.incluye.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-tinta/80">
                        <Check size={15} className="mt-0.5 shrink-0 text-acento" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5"
                    tamano="sm"
                    onClick={() => document.getElementById('cotizar')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Solicitar cotización
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Formulario de cotización */}
      <section id="cotizar" className="mx-auto max-w-3xl scroll-mt-32 px-4 py-16 md:px-6 lg:py-20">
        <SectionTitle
          centrado
          etiqueta="Cotiza sin compromiso"
          titulo="Cuéntanos sobre tu evento"
          descripcion="Te responderemos por WhatsApp en menos de 24 horas con una propuesta a tu medida."
          className="mb-8"
        />

        {enviado ? (
          <div className="anim-pop rounded-[2rem] bg-emerald-50 p-10 text-center ring-1 ring-emerald-200">
            <span className="text-6xl">💌</span>
            <h3 className="mt-4 font-display text-2xl font-semibold text-emerald-900">
              ¡Solicitud enviada!
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-emerald-800">
              Gracias, {form.nombre.split(' ')[0] || 'amig@'} 🧡. Nuestro equipo revisará los
              detalles de tu {form.tipoEvento.toLowerCase()} y te contactará muy pronto.
            </p>
            <Button variante="oscuro" className="mt-6" onClick={() => setEnviado(false)}>
              Enviar otra solicitud
            </Button>
          </div>
        ) : (
          <form
            onSubmit={enviar}
            className="space-y-4 rounded-[2rem] border border-borde/60 bg-white p-6 shadow-sm md:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nombre *" placeholder="Tu nombre" required value={form.nombre} onChange={set('nombre')} />
              <Input label="Teléfono *" type="tel" placeholder="999 999 999" required value={form.telefono} onChange={set('telefono')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Tipo de evento" opciones={tiposEvento} value={form.tipoEvento} onChange={set('tipoEvento')} />
              <Input label="Fecha del evento *" type="date" min="2026-07-09" required value={form.fecha} onChange={set('fecha')} />
            </div>
            <Input
              label="Cantidad de personas *"
              type="number"
              min="10"
              placeholder="Ej. 40"
              required
              value={form.personas}
              onChange={set('personas')}
            />
            <Input
              label="Mensaje"
              textarea
              placeholder="Cuéntanos la temática, colores, postres favoritos o cualquier detalle especial…"
              value={form.mensaje}
              onChange={set('mensaje')}
            />
            <Button tamano="lg" type="submit" className="w-full">
              Enviar solicitud de cotización
            </Button>
            <p className="text-center text-xs text-gris">
              Al enviar aceptas que te contactemos por WhatsApp o correo. Sin spam, prometido 🤞
            </p>
          </form>
        )}
      </section>
    </div>
  )
}
