import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AlertasProvider, useAlertas } from '../../context/AlertasContext'
import { SECCIONES_ACTIVAS, SECCIONES_PROXIMAMENTE } from '../../config/secciones'

/** Contador naranja (el naranja oscuro, para que el número blanco se lea: contraste AA). */
function Contador({ n, className = '' }) {
  if (!n) return null
  return (
    <span
      className={`grid min-w-[18px] place-items-center rounded-full bg-acento-oscuro px-1 text-[10px] font-bold leading-[18px] text-white ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

function ItemMenu({ seccion, contador }) {
  const Icono = seccion.icono
  return (
    <NavLink
      to={seccion.ruta}
      className={({ isActive }) =>
        `relative flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition-colors ${
          isActive ? 'bg-acento-suave text-acento-oscuro' : seccion.proximamente ? 'text-gris/80' : 'text-gris hover:bg-borde/50'
        }`
      }
    >
      <Icono size={19} aria-hidden="true" />
      <span className="text-[10.5px] font-semibold leading-tight">{seccion.etiqueta}</span>
      {seccion.proximamente && <span className="-mt-0.5 text-[9px] font-medium uppercase tracking-wide text-gris/70">Pronto</span>}
      <Contador n={contador} className="absolute right-1.5 top-0.5" />
    </NavLink>
  )
}

/** Menú de secciones horizontal, desplazable en celular; la sección activa se centra sola. */
function MenuSecciones() {
  const { alertas } = useAlertas()
  const { pathname } = useLocation()
  const contenedor = useRef(null)

  useEffect(() => {
    const activo = contenedor.current?.querySelector('[aria-current="page"]')
    activo?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [pathname])

  return (
    <nav aria-label="Secciones" className="sticky top-0 z-30 border-b border-borde bg-crema/95 backdrop-blur">
      <div ref={contenedor} className="sin-barra-scroll mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 py-2">
        {SECCIONES_ACTIVAS.map((s) => (
          <ItemMenu key={s.ruta} seccion={s} contador={s.conAlertas ? alertas?.total : 0} />
        ))}
        {SECCIONES_PROXIMAMENTE.map((s) => (
          <ItemMenu key={s.ruta} seccion={{ ...s, proximamente: true }} />
        ))}
      </div>
    </nav>
  )
}

function Encabezado() {
  const { logout, perfil } = useAuth()
  const { alertas } = useAlertas()
  const total = alertas?.total ?? 0
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-3">
      <Link to="/resumen" className="flex items-center gap-2.5" aria-label="Bake OS — Resumen">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-tinta text-[13px] font-bold text-white">B</span>
        <span className="text-sm font-semibold">Bake OS</span>
        <span className="hidden text-xs capitalize text-gris sm:inline">
          · {perfil?.rol === 'admin' ? 'Dirección' : (perfil?.sedeNombre ?? 'Sede')}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Link
          to="/control-tower"
          aria-label={total ? `Alertas: ${total} requieren atención` : 'Alertas: sin excepciones activas'}
          className="relative grid h-10 w-10 place-items-center rounded-xl border border-borde bg-hueso"
        >
          <Bell size={18} aria-hidden="true" />
          <Contador n={total} className="absolute -right-1.5 -top-1.5" />
        </Link>
        <button
          type="button"
          onClick={logout}
          aria-label="Salir"
          className="grid h-10 w-10 place-items-center rounded-xl border border-borde bg-hueso text-gris hover:text-tinta"
        >
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

/** Marco común de todas las pantallas del panel: menú arriba, encabezado Bake OS con campana y el contenido. */
export default function LayoutBakeOS({ children }) {
  // Cada sección empieza arriba (el scroll de la anterior no se hereda).
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <AlertasProvider>
      <div className="min-h-screen pb-16">
        <MenuSecciones />
        <Encabezado />
        <main className="mx-auto max-w-5xl px-4">{children}</main>
      </div>
    </AlertasProvider>
  )
}
