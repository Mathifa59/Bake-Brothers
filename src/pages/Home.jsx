import { Link } from 'react-router-dom'
import { ArrowRight, Star, Sparkles } from 'lucide-react'
import {
  ofertas,
  categorias,
  destacados,
  testimonios,
  productos,
  formatoPrecio,
} from '../data/mock'
import Button from '../components/Button'
import SectionTitle from '../components/SectionTitle'
import OfferCard from '../components/OfferCard'
import CategoryCard from '../components/CategoryCard'
import ProductGrid from '../components/ProductGrid'
import ProductImage from '../components/ProductImage'

const pasosCompra = [
  { emoji: '🧁', titulo: 'Elige tus productos', texto: 'Explora el catálogo y encuentra tus favoritos.' },
  { emoji: '🛒', titulo: 'Agrégalos al carrito', texto: 'Elige tamaño, extras y cantidad a tu gusto.' },
  { emoji: '📅', titulo: 'Coordina tu pedido', texto: 'Escoge fecha, hora y método de pago.' },
  { emoji: '🎉', titulo: 'Recibe o recoge', texto: 'Delivery a tu puerta o recojo en tienda.' },
]

const frasesTicker = [
  'Hecho artesanalmente para compartir',
  'Endulza tus momentos especiales',
  'Pide hoy y coordina tu entrega',
  'Postres frescos, suaves y preparados con cariño',
  'Ingredientes de verdad, sabor de casa',
]

export default function Home() {
  // Productos con fotografía para la composición del hero
  const heroDestacados = [
    productos.find((p) => p.id === 'torta-chocolate'),
    productos.find((p) => p.id === 'cheesecake-frutos-rojos'),
    productos.find((p) => p.id === 'petipanes'),
  ]

  return (
    <div>
      {/* ——— HERO ——— */}
      <section className="relative overflow-hidden bg-puntos">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-12 md:px-6 lg:grid-cols-2 lg:pb-24 lg:pt-20">
          <div className="anim-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-acento/30 bg-acento-suave px-4 py-1.5 text-xs font-bold tracking-wide text-acento-oscuro">
              <Sparkles size={13} /> Horneando felicidad desde 2018
            </span>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-tinta md:text-6xl lg:text-7xl [text-wrap:balance]">
              Pastelería artesanal
              <em className="block font-light italic text-acento"> hecha con cariño</em>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-gris">
              Tortas, postres, bocaditos y catering para tus momentos especiales.
              Horneamos cada día, solo con ingredientes de verdad.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button tamano="lg" to="/catalogo">
                Ver catálogo <ArrowRight size={17} />
              </Button>
              <Button tamano="lg" variante="oscuro" to="/checkout">
                Hacer pedido
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-gris">
              <span className="flex text-acento" aria-label="5 estrellas">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={15} fill="currentColor" />
                ))}
              </span>
              <span>
                <strong className="text-tinta">+2,500 clientes felices</strong> en Lima
              </span>
            </div>
          </div>

          {/* Composición visual del hero */}
          <div className="anim-fade-up delay-2 relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative grid grid-cols-2 gap-4">
              <Link
                to={`/producto/${heroDestacados[0].id}`}
                className="group anim-float col-span-2 block overflow-hidden rounded-[2.5rem] shadow-xl shadow-tinta/10 ring-1 ring-borde"
              >
                <ProductImage producto={heroDestacados[0]} className="aspect-[16/9]" tamanoEmoji="text-9xl" prioridad />
              </Link>
              <Link
                to={`/producto/${heroDestacados[1].id}`}
                className="group block overflow-hidden rounded-[2rem] shadow-lg shadow-tinta/10 ring-1 ring-borde"
              >
                <ProductImage producto={heroDestacados[1]} className="aspect-square" tamanoEmoji="text-7xl" prioridad />
              </Link>
              <Link
                to={`/producto/${heroDestacados[2].id}`}
                className="group block overflow-hidden rounded-[2rem] shadow-lg shadow-tinta/10 ring-1 ring-borde"
              >
                <ProductImage producto={heroDestacados[2]} className="aspect-square" tamanoEmoji="text-7xl" prioridad />
              </Link>
            </div>
            {/* Etiqueta flotante */}
            <div className="absolute -left-3 top-6 rotate-[-6deg] rounded-2xl bg-white px-4 py-2.5 shadow-lg ring-1 ring-borde md:-left-8">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gris">Lo más pedido</p>
              <p className="font-display text-sm font-semibold">🍫 Torta de chocolate</p>
              <p className="text-sm font-extrabold text-acento">{formatoPrecio(76)}</p>
            </div>
            <div className="absolute -bottom-4 right-2 rotate-3 rounded-2xl bg-tinta px-4 py-2.5 text-white shadow-lg md:-right-4">
              <p className="text-xs font-bold">🚚 Delivery el mismo día</p>
            </div>
          </div>
        </div>

        {/* Ticker de frases */}
        <div className="overflow-hidden border-y border-borde bg-white py-3">
          <div className="anim-marquee flex w-max gap-8 whitespace-nowrap">
            {[...frasesTicker, ...frasesTicker].map((f, i) => (
              <span key={i} className="flex items-center gap-8 text-sm font-semibold text-tinta/60">
                {f} <span className="text-acento">✦</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ——— OFERTAS DE LA SEMANA ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionTitle
            etiqueta="Por tiempo limitado"
            titulo="Ofertas de la semana"
            descripcion="Precios especiales en nuestros favoritos. Aprovecha antes de que se acaben."
          />
          <Button variante="secundario" to="/ofertas">
            Ver todas las ofertas <ArrowRight size={15} />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ofertas.slice(0, 4).map((p) => (
            <OfferCard key={p.id} producto={p} />
          ))}
        </div>
      </section>

      {/* ——— CATEGORÍAS ——— */}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionTitle
            centrado
            etiqueta="Explora"
            titulo="¿Qué se te antoja hoy?"
            descripcion="Desde tortas de celebración hasta bocaditos para compartir."
            className="mb-10"
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.map((c) => (
              <CategoryCard key={c.id} categoria={c} />
            ))}
          </div>
        </div>
      </section>

      {/* ——— DESTACADOS ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionTitle
            etiqueta="Los favoritos"
            titulo="Productos destacados"
            descripcion="Los más pedidos por nuestros clientes, semana tras semana."
          />
          <Button variante="secundario" to="/catalogo">
            Ver catálogo completo <ArrowRight size={15} />
          </Button>
        </div>
        <ProductGrid productos={destacados} />
      </section>

      {/* ——— CÓMO COMPRAR ——— */}
      <section className="bg-tinta py-16 text-white lg:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-bold tracking-[0.2em] uppercase text-acento">Así de fácil</p>
            <h2 className="font-display text-3xl font-semibold md:text-4xl">¿Cómo comprar?</h2>
          </div>
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {pasosCompra.map((paso, i) => (
              <li key={i} className="relative rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 transition-colors hover:bg-white/10">
                <span className="absolute -top-4 left-6 grid h-8 w-8 place-items-center rounded-full bg-acento text-sm font-black">
                  {i + 1}
                </span>
                <span className="text-4xl">{paso.emoji}</span>
                <h3 className="mt-3 font-display text-lg font-semibold">{paso.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/60">{paso.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ——— CATERING ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:py-20">
        <div className="grid items-center gap-10 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-acento-suave via-white to-acento-suave p-8 ring-1 ring-borde md:p-12 lg:grid-cols-2">
          <div>
            <SectionTitle
              etiqueta="Eventos"
              titulo="Catering para eventos"
              descripcion="Cotiza tu mesa dulce para cumpleaños, reuniones o eventos corporativos. Nos encargamos del montaje, la decoración y, por supuesto, del sabor."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button to="/catering">Solicitar cotización</Button>
              <Button variante="secundario" to="/catering">Ver paquetes</Button>
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-[2rem] shadow-lg ring-1 ring-borde">
              <img
                src="/img/vitrina-pasteleria.jpg"
                alt="Mesa dulce para eventos"
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 left-6 rounded-2xl bg-white px-4 py-2.5 shadow-lg ring-1 ring-borde">
              <p className="text-xs font-bold text-tinta">✨ Mesas dulces desde {formatoPrecio(350)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ——— TESTIMONIOS ——— */}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionTitle
            centrado
            etiqueta="Clientes felices"
            titulo="Lo que dicen de nosotros"
            className="mb-10"
          />
          <div className="grid gap-5 md:grid-cols-3">
            {testimonios.map((t, i) => (
              <figure
                key={i}
                className="flex flex-col rounded-3xl border border-borde/60 bg-hueso p-7 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-tinta/5"
              >
                <span className="flex gap-0.5 text-acento" aria-label={`${t.estrellas} estrellas`}>
                  {[...Array(t.estrellas)].map((_, j) => (
                    <Star key={j} size={15} fill="currentColor" />
                  ))}
                </span>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-tinta/80">
                  “{t.texto}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-borde/60 pt-4">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-acento-suave text-xl">
                    {t.emoji}
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{t.nombre}</span>
                    <span className="block text-xs text-gris">{t.detalle}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ——— CTA FINAL ——— */}
      <section className="mx-auto max-w-7xl px-4 pt-16 md:px-6">
        <div className="rounded-[2.5rem] bg-acento px-8 py-14 text-center text-white shadow-xl shadow-acento/30">
          <h2 className="font-display text-3xl font-semibold md:text-5xl [text-wrap:balance]">
            Endulza tus momentos especiales
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-white/85">
            Pide hoy y coordina tu entrega. Horneamos con ingredientes frescos, como en casa.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variante="oscuro" tamano="lg" to="/catalogo">
              Explorar catálogo
            </Button>
            <Button
              tamano="lg"
              to="/ofertas"
              className="!bg-white !text-acento-oscuro hover:!bg-hueso !shadow-none"
            >
              Ver ofertas
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
