import { Link } from 'react-router-dom'
import { useOutletContext } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import VideosHero from '../components/landing/VideosHero'

// Teaser de categorías — pedido real tras el feedback de una usuaria
// ("arriba no hay nada... asumo que no es lo único que ofrecen"). El header
// ya resuelve la navegación, pero acá además se muestra de entrada que hay
// más que los dos videos del hero, con fotos reales de cada categoría,
// linkeando al Menú (sin duplicar el catálogo acá).
const categoriasDestacadas = [
  { id: 'alfajores', nombre: 'Alfajores', imagen: '/img/menu/alfajor-mix.webp' },
  { id: 'cuchareables', nombre: 'Cuchareables', imagen: '/img/menu/cuchareable-nutella.webp' },
  { id: 'empanadas', nombre: 'Empanadas BigBro', imagen: '/img/empanadas/carnivora.webp' },
  { id: 'postres', nombre: 'Postres y Tortas', imagen: '/img/menu/torta-red-velvet.webp' },
]

export default function Inicio() {
  const { setHeroEnPantalla } = useOutletContext()

  return (
    <>
      {/* Encabezado real de la página, oculto visualmente — VideosHero ya
          muestra el nombre del producto en pantalla (h2 por diseño, cambia
          según el video activo), pero cada página necesita su propio h1
          para el orden de encabezados. */}
      <h1 className="sr-only">Bake Brothers — Pastelería artesanal en Chorrillos</h1>
      <VideosHero onVisibilidadCambia={setHeroEnPantalla} />

      <section className="bg-crema px-6 py-20 sm:px-12 sm:py-28 lg:px-20">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Hay mucho más</h2>
            <p className="mt-3 max-w-md text-gris">Alfajores, cuchareables, empanadas, tortas, postres y bebidas — todo el menú real, acá.</p>
          </div>
          <Link
            to="/menu"
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-tinta/15 px-5 py-2.5 text-sm font-semibold text-tinta transition-colors hover:border-tinta/30 sm:flex"
          >
            Ver el menú
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {categoriasDestacadas.map((categoria) => (
            <Link
              key={categoria.id}
              to="/menu"
              className="group relative block overflow-hidden rounded-[24px] shadow-md transition-all duration-500 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="aspect-[3/4] overflow-hidden bg-tinta">
                <img
                  src={categoria.imagen}
                  alt={categoria.nombre}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent px-4 pb-4 pt-10">
                <p className="font-display text-base font-semibold text-white sm:text-lg">{categoria.nombre}</p>
              </div>
            </Link>
          ))}
        </div>

        <Link to="/menu" className="mt-8 flex items-center justify-center gap-1.5 text-sm font-semibold text-tinta sm:hidden">
          Ver el menú completo
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  )
}
