import { Link } from 'react-router-dom'

export default function Logo({ claro = false, tamano = 'md' }) {
  const alto = tamano === 'lg' ? 'h-12 w-12 text-2xl' : 'h-10 w-10 text-xl'
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="Bake Brothers — Inicio">
      <span
        className={`${alto} grid place-items-center rounded-full bg-acento font-display font-bold text-white shadow-md shadow-acento/30 transition-transform group-hover:rotate-6`}
      >
        B
      </span>
      <span className="leading-none">
        <span
          className={`block font-display text-lg font-semibold tracking-tight ${claro ? 'text-white' : 'text-tinta'}`}
        >
          Bake Brothers
        </span>
        <span
          className={`block text-[10px] font-bold tracking-[0.28em] uppercase ${claro ? 'text-white/60' : 'text-gris'}`}
        >
          Pastelería Artesanal
        </span>
      </span>
    </Link>
  )
}
