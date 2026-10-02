import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, MessageCircle, X } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'
import { mensajeWhatsappGenerico } from '../../config/landing'

const enlaces = [
  { to: '/', label: 'Inicio', fin: true },
  { to: '/menu', label: 'Menú' },
  { to: '/locales', label: 'Locales' },
]

// Header fijo con navegación real — pedido explícito del cliente tras el
// feedback de una usuaria real ("arriba no hay nada, ni un menú... asumo
// que no es lo único que ofrecen"). Antes la landing era una sola vista sin
// ninguna señal de que hubiera más contenido; ahora cada página vive bajo
// su propia ruta y este header es lo único que se renderiza en las tres
// (ver pages/Layout.jsx).
export default function Header() {
  const [abierto, setAbierto] = useState(false)

  // `text-acento` sobre `bg-crema` da solo ~2.3:1 de contraste (WCAG exige
  // 4.5:1 para texto normal) — el activo se marca con texto bien oscuro
  // (máximo contraste) + una raya inferior de acento como señal visual
  // extra, en vez de pintar el texto del color de marca.
  const clasesLink = ({ isActive }) =>
    `border-b-2 pb-1 text-sm font-semibold transition-colors ${
      isActive ? 'border-acento-oscuro text-tinta' : 'border-transparent text-tinta/70 hover:text-tinta'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-borde/60 bg-crema/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:h-20 sm:px-12 lg:px-20">
        <Link to="/" className="shrink-0" onClick={() => setAbierto(false)} aria-label="Bake Brothers — Inicio">
          <img src="/img/logo-landing.png" alt="Bake Brothers" width={160} height={90} className="h-12 w-auto sm:h-16" />
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {enlaces.map((enlace) => (
            <NavLink key={enlace.to} to={enlace.to} end={enlace.fin} className={clasesLink}>
              {enlace.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <WhatsAppCTA
            mensaje={mensajeWhatsappGenerico}
            producto="header"
            className="hidden items-center gap-2 rounded-full bg-[#0F7B3F] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[#0F7B3F]/25 transition-transform hover:scale-105 active:scale-95 sm:flex"
          >
            <MessageCircle size={16} fill="white" className="text-[#0F7B3F]" />
            Pedir
          </WhatsAppCTA>

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            className="grid h-10 w-10 place-items-center rounded-full text-tinta transition-colors hover:bg-tinta/5 sm:hidden"
          >
            {abierto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Menú mobile — panel desplegable bajo el header, mismo set de links. */}
      {abierto && (
        <nav className="flex flex-col gap-1 border-t border-borde/60 bg-crema px-6 py-4 sm:hidden">
          {enlaces.map((enlace) => (
            <NavLink
              key={enlace.to}
              to={enlace.to}
              end={enlace.fin}
              onClick={() => setAbierto(false)}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2.5 text-base font-semibold ${isActive ? 'bg-tinta text-white' : 'text-tinta/80'}`
              }
            >
              {enlace.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
