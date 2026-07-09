import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function CategoryCard({ categoria }) {
  const [desde, hasta] = categoria.g
  return (
    <Link
      to={`/catalogo?tipo=${encodeURIComponent(categoria.tipo)}`}
      className="group relative flex flex-col justify-end overflow-hidden rounded-3xl p-6 shadow-sm ring-1 ring-borde/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-tinta/10 min-h-44 md:min-h-52"
      style={{ background: `linear-gradient(150deg, ${desde}, ${hasta})` }}
    >
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/30 transition-transform duration-500 group-hover:scale-125"
        aria-hidden="true"
      />
      <span className="absolute right-5 top-5 text-5xl drop-shadow-sm transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110">
        {categoria.emoji}
      </span>
      <h3 className="font-display text-2xl font-semibold text-tinta">{categoria.nombre}</h3>
      <p className="mt-0.5 text-sm text-tinta/60">{categoria.texto}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-tinta transition-colors group-hover:text-acento-oscuro">
        Explorar
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  )
}
