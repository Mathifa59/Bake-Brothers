// Imagen de producto: usa fotografía real si el producto tiene `foto`;
// si no, cae a la composición de gradiente + emoji.
export default function ProductImage({
  producto,
  className = '',
  tamanoEmoji = 'text-7xl',
  prioridad = false,
}) {
  if (producto.foto) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={producto.foto}
          alt={producto.nombre}
          loading={prioridad ? 'eager' : 'lazy'}
          fetchPriority={prioridad ? 'high' : 'auto'}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    )
  }

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
