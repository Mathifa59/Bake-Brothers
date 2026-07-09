const estilos = {
  oferta: 'bg-acento text-white',
  categoria: 'bg-tinta/5 text-tinta/70',
  agotado: 'bg-tinta/80 text-white',
  claro: 'bg-white/90 text-tinta backdrop-blur',
  acento: 'bg-acento-suave text-acento-oscuro',
}

export default function Badge({ children, tipo = 'categoria', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase ${estilos[tipo]} ${className}`}
    >
      {children}
    </span>
  )
}
