// Imagen simulada de producto: gradiente suave + emoji grande.
// Reemplazable por fotografías reales manteniendo la misma interfaz.
export default function ProductImage({ producto, className = '', tamanoEmoji = 'text-7xl' }) {
  const [desde, hasta] = producto.g || ['#F4E9DA', '#E8CFA8']
  return (
    <div
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${desde}, ${hasta})` }}
      role="img"
      aria-label={producto.nombre}
    >
      <span
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/30"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/20"
        aria-hidden="true"
      />
      <span className={`${tamanoEmoji} drop-shadow-sm transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3`}>
        {producto.emoji}
      </span>
    </div>
  )
}
