import { Heart, Leaf, Clock, HandHeart } from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import Button from '../components/Button'

const valores = [
  {
    Icono: Heart,
    titulo: 'Calidad artesanal',
    texto: 'Cada torta, postre y bocadito se hornea a mano, en tandas pequeñas, sin premezclas ni atajos.',
  },
  {
    Icono: Leaf,
    titulo: 'Ingredientes frescos',
    texto: 'Mantequilla de verdad, fruta de estación y chocolate de origen. Lo que no usaríamos en casa, no entra a la cocina.',
  },
  {
    Icono: Clock,
    titulo: 'Puntualidad',
    texto: 'Sabemos que tu evento no espera. Coordinamos cada entrega al detalle para llegar siempre a tiempo.',
  },
  {
    Icono: HandHeart,
    titulo: 'Cercanía con el cliente',
    texto: 'Te acompañamos desde la cotización hasta el último bocadito. Hablamos contigo, no con un ticket.',
  },
]

export default function Nosotros() {
  return (
    <div>
      {/* Historia */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
        <div className="anim-fade-up">
          <SectionTitle
            etiqueta="Nuestra historia"
            titulo="Dos hermanos, un horno y muchas ganas de compartir"
          />
          <div className="mt-5 space-y-4 leading-relaxed text-gris">
            <p>
              <strong className="text-tinta">Bake Brothers</strong> nació en 2018 en la cocina de
              la casa familiar, cuando dos hermanos decidieron convertir las recetas de la abuela
              en algo más que un recuerdo de domingo. Lo que empezó con pedidos de amigos y
              vecinos, hoy es una pastelería artesanal que endulza celebraciones en toda Lima.
            </p>
            <p>
              Seguimos horneando igual que el primer día: en tandas pequeñas, con ingredientes
              frescos y probando cada receta hasta que sepa a casa. Crecimos, pero la esencia es
              la misma — la diferencia es que ahora compartimos con muchas más familias.
            </p>
          </div>
          <div className="mt-7 flex gap-3">
            <Button to="/catalogo">Prueba nuestros productos</Button>
            <Button variante="secundario" to="/contacto">Conversemos</Button>
          </div>
        </div>

        {/* Imagen del equipo / cocina */}
        <div className="anim-fade-up delay-2 relative mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-[3rem] shadow-2xl shadow-tinta/10 ring-1 ring-borde">
            <img
              src="/img/chef-bake-brothers.jpg"
              alt="Uno de los hermanos de Bake Brothers preparando ganache de chocolate"
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
          <div className="absolute -left-4 top-8 rotate-[-6deg] rounded-2xl bg-white px-4 py-2.5 shadow-lg ring-1 ring-borde">
            <p className="text-xs font-bold">🥇 Desde 2018</p>
          </div>
          <div className="absolute -bottom-4 -right-2 rotate-3 rounded-2xl bg-tinta px-4 py-2.5 text-white shadow-lg">
            <p className="text-xs font-bold">+2,500 clientes felices</p>
          </div>
        </div>
      </section>

      {/* Misión */}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-acento">Nuestra misión</p>
          <p className="mt-4 font-display text-2xl font-medium leading-relaxed text-tinta md:text-3xl [text-wrap:balance]">
            Hacer que cada celebración, grande o pequeña, tenga en la mesa algo
            horneado con dedicación, ingredientes honestos y el sabor de lo hecho en casa.
          </p>
        </div>
      </section>

      {/* Valores */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:py-20">
        <SectionTitle centrado etiqueta="Lo que nos define" titulo="Nuestros valores" className="mb-10" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {valores.map(({ Icono, titulo, texto }) => (
            <div
              key={titulo}
              className="rounded-3xl border border-borde/60 bg-white p-7 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-tinta/5"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-acento-suave text-acento-oscuro">
                <Icono size={22} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gris">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Frase */}
      <section className="mx-auto max-w-7xl px-4 pb-4 md:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-tinta px-8 py-16 text-center text-white">
          <span className="pointer-events-none absolute -left-6 -top-6 text-9xl opacity-10">🍞</span>
          <span className="pointer-events-none absolute -bottom-8 -right-4 text-9xl opacity-10">🎂</span>
          <p className="relative mx-auto max-w-2xl font-display text-3xl font-medium italic leading-snug md:text-4xl [text-wrap:balance]">
            “Cada pedido se prepara como si fuera
            <span className="text-acento"> para casa</span>.”
          </p>
          <p className="relative mt-5 text-sm font-bold uppercase tracking-[0.25em] text-white/50">
            — Los hermanos de Bake Brothers
          </p>
        </div>
      </section>
    </div>
  )
}
