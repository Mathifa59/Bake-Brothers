import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function CategoryCard({ categoria }) {
  const [desde, hasta] = categoria.g
  return (
    <Link
      to={`/catalogo?tipo=${encodeURIComponent(categoria.tipo)}`}
      className="group relative flex min-h-52 flex-col justify-end overflow-hidden rounded-3xl p-6 shadow-sm ring-1 ring-borde/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-tinta/15 md:min-h-60"
      style={{ background: `linear-gradient(150deg, ${desde}, ${hasta})` }}
    >
      {categoria.foto && (
        <img
          src={categoria.foto}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      {/* Degradado para legibilidad del texto sobre la foto */}
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tinta/80 via-tinta/25 to-transparent"
        aria-hidden="true"
      />
      <span className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full bg-white/90 text-2xl shadow-md backdrop-blur transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110">
        {categoria.emoji}
      </span>
      <h3 className="relative font-display text-2xl font-semibold text-white">{categoria.nombre}</h3>
      <p className="relative mt-0.5 text-sm text-white/75">{categoria.texto}</p>
      <span className="relative mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-white transition-colors group-hover:text-acento">
        Explorar
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  )
}
