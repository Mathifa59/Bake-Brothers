import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, ShoppingBag, User, X } from 'lucide-react'
import { useCart } from '../context/CartContext'
import Logo from './Logo'

const enlaces = [
  { a: '/', texto: 'Inicio' },
  { a: '/catalogo', texto: 'Catálogo' },
  { a: '/catalogo?categoria=dulces', texto: 'Dulces' },
  { a: '/catalogo?categoria=salados', texto: 'Salados' },
  { a: '/catering', texto: 'Catering' },
  { a: '/nosotros', texto: 'Sobre nosotros' },
  { a: '/contacto', texto: 'Contacto' },
]

export default function Header() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const { cantidadTotal, abrirDrawer } = useCart()
  const location = useLocation()

  const esActivo = (a) => {
    const [ruta, query] = a.split('?')
    if (query) return location.pathname === ruta && location.search === `?${query}`
    return location.pathname === ruta && (ruta !== '/catalogo' || !location.search.includes('categoria'))
  }

  return (
    <header className="sticky top-0 z-40 border-b border-borde/70 bg-crema/85 backdrop-blur-lg">
      {/* Barra superior de anuncio */}
      <div className="bg-tinta py-1.5 text-center text-[11px] font-semibold tracking-wide text-white">
        🚚 Delivery gratis en pedidos desde S/ 150 · Usa el cupón <span className="text-acento">BAKE10</span> y llévate 10% dcto.
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Logo />

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Navegación principal">
          {enlaces.map((e) => (
            <NavLink
              key={e.a}
              to={e.a}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                esActivo(e.a)
                  ? 'bg-acento-suave text-acento-oscuro'
                  : 'text-tinta/70 hover:bg-tinta/5 hover:text-tinta'
              }`}
            >
              {e.texto}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            to="/login"
            className="grid h-10 w-10 place-items-center rounded-full text-tinta/70 transition-colors hover:bg-tinta/5 hover:text-tinta"
            aria-label="Mi cuenta"
          >
            <User size={20} />
          </Link>
          <button
            onClick={abrirDrawer}
            className="relative grid h-10 w-10 place-items-center rounded-full bg-tinta text-white transition-all hover:bg-acento cursor-pointer"
            aria-label={`Carrito de compras, ${cantidadTotal} productos`}
          >
            <ShoppingBag size={18} />
            {cantidadTotal > 0 && (
              <span className="anim-pop absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-acento px-1 text-[11px] font-black text-white ring-2 ring-crema">
                {cantidadTotal}
              </span>
            )}
          </button>
          <button
            onClick={() => setMenuAbierto(!menuAbierto)}
            className="grid h-10 w-10 place-items-center rounded-full text-tinta transition-colors hover:bg-tinta/5 lg:hidden cursor-pointer"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          >
            {menuAbierto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Menú móvil */}
      {menuAbierto && (
        <nav
          className="anim-fade-in border-t border-borde/70 bg-hueso px-4 py-4 lg:hidden"
          aria-label="Navegación móvil"
        >
          <div className="flex flex-col gap-1">
            {enlaces.map((e) => (
              <NavLink
                key={e.a}
                to={e.a}
                onClick={() => setMenuAbierto(false)}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                  esActivo(e.a) ? 'bg-acento-suave text-acento-oscuro' : 'text-tinta/80 hover:bg-tinta/5'
                }`}
              >
                {e.texto}
              </NavLink>
            ))}
            <NavLink
              to="/login"
              onClick={() => setMenuAbierto(false)}
              className="rounded-2xl px-4 py-3 text-sm font-semibold text-tinta/80 hover:bg-tinta/5"
            >
              👤 Mi cuenta
            </NavLink>
          </div>
        </nav>
      )}
    </header>
  )
}
