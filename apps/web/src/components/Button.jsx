import { Link } from 'react-router-dom'

const variantes = {
  primario:
    'bg-acento text-white hover:bg-acento-oscuro shadow-md shadow-acento/25 hover:shadow-lg hover:shadow-acento/30',
  oscuro: 'bg-tinta text-white hover:bg-black',
  secundario:
    'bg-white text-tinta border border-borde hover:border-acento hover:text-acento',
  fantasma: 'text-tinta hover:bg-tinta/5',
  suave: 'bg-acento-suave text-acento-oscuro hover:bg-acento hover:text-white',
}

const tamanos = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
}

export default function Button({
  children,
  variante = 'primario',
  tamano = 'md',
  to,
  className = '',
  ...props
}) {
  const clases = `inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-all duration-200 active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${variantes[variante]} ${tamanos[tamano]} ${className}`

  if (to) {
    return (
      <Link to={to} className={clases} {...props}>
        {children}
      </Link>
    )
  }
  return (
    <button className={clases} {...props}>
      {children}
    </button>
  )
}
