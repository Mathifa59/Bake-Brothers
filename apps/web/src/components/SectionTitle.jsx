export default function SectionTitle({ etiqueta, titulo, descripcion, centrado = false, className = '' }) {
  return (
    <div className={`${centrado ? 'text-center mx-auto' : ''} max-w-2xl ${className}`}>
      {etiqueta && (
        <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase text-acento">
          {centrado && <span className="hidden" />}
          <span className={centrado ? 'mx-auto flex items-center gap-2' : 'flex items-center gap-2'}>
            <span className="inline-block h-[2px] w-6 bg-acento" />
            {etiqueta}
          </span>
        </p>
      )}
      <h2 className="font-display text-3xl font-semibold text-tinta md:text-4xl [text-wrap:balance]">
        {titulo}
      </h2>
      {descripcion && <p className="mt-3 text-gris leading-relaxed">{descripcion}</p>}
    </div>
  )
}
