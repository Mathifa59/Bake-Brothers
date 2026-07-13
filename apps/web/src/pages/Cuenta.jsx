import { Link, NavLink, useParams } from 'react-router-dom'
import { ChevronRight, LogOut, MapPin, Package, User } from 'lucide-react'
import { pedidosSimulados, coloresEstado, formatoPrecio } from '../data/mock'
import { useCart } from '../context/CartContext'
import Button from '../components/Button'
import Badge from '../components/Badge'

function MarcoCuenta({ titulo, children }) {
  const enlaces = [
    { a: '/cuenta', texto: 'Mi cuenta', Icono: User, exacto: true },
    { a: '/cuenta/pedidos', texto: 'Mis pedidos', Icono: Package },
  ]
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 lg:py-14">
      <h1 className="mb-8 font-display text-4xl font-semibold">{titulo}</h1>
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-3xl border border-borde/60 bg-white p-4 lg:sticky lg:top-32">
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-acento-suave px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-acento text-lg font-black text-white">
              M
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">Mathias Vásquez</span>
              <span className="block truncate text-xs text-gris">mathiwen519@gmail.com</span>
            </span>
          </div>
          <nav className="space-y-1">
            {enlaces.map(({ a, texto, Icono, exacto }) => (
              <NavLink
                key={a}
                to={a}
                end={exacto}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isActive ? 'bg-tinta text-white' : 'text-tinta/70 hover:bg-tinta/5'
                  }`
                }
              >
                <Icono size={16} /> {texto}
              </NavLink>
            ))}
            <Link
              to="/"
              className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
            >
              <LogOut size={16} /> Cerrar sesión
            </Link>
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  )
}

export function MiCuenta() {
  return (
    <MarcoCuenta titulo="Mi cuenta">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['🧾', 'Pedidos realizados', pedidosSimulados.length],
            ['🧡', 'Producto favorito', 'Torta de chocolate'],
            ['⭐', 'Puntos Bake Club', '340 pts'],
          ].map(([emoji, titulo, valor]) => (
            <div key={titulo} className="rounded-3xl border border-borde/60 bg-white p-5">
              <span className="text-3xl">{emoji}</span>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gris">{titulo}</p>
              <p className="mt-0.5 font-display text-lg font-semibold">{valor}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-borde/60 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-semibold">Datos personales</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ['Nombre', 'Mathias Vásquez'],
              ['Correo', 'mathiwen519@gmail.com'],
              ['Teléfono', '+51 987 654 321'],
              ['Distrito frecuente', 'Miraflores'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-hueso px-4 py-3 ring-1 ring-borde/60">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-gris">{k}</dt>
                <dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <Button variante="secundario" tamano="sm" className="mt-4">Editar datos</Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-acento-suave p-6 ring-1 ring-acento/20">
          <div>
            <h2 className="font-display text-lg font-semibold">¿Se te antoja algo? 🍰</h2>
            <p className="text-sm text-gris">Vuelve a pedir tus favoritos en un par de clics.</p>
          </div>
          <Button to="/catalogo">Ir al catálogo</Button>
        </div>
      </div>
    </MarcoCuenta>
  )
}

export function MisPedidos() {
  return (
    <MarcoCuenta titulo="Mis pedidos">
      <div className="space-y-4">
        {pedidosSimulados.map((pedido) => (
          <Link
            key={pedido.id}
            to={`/cuenta/pedidos/${pedido.id}`}
            className="group flex flex-wrap items-center gap-4 rounded-3xl border border-borde/60 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-acento/40 hover:shadow-lg hover:shadow-tinta/5"
          >
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-hueso text-2xl ring-1 ring-borde/60">
              {pedido.items[0].emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-display font-semibold">Pedido {pedido.id}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${coloresEstado[pedido.estado]}`}>
                  {pedido.estado}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-gris">
                {pedido.fecha} · {pedido.entrega} · {pedido.items.length}{' '}
                {pedido.items.length === 1 ? 'producto' : 'productos'}
              </span>
            </span>
            <span className="font-extrabold">{formatoPrecio(pedido.total)}</span>
            <ChevronRight size={18} className="text-gris transition-transform group-hover:translate-x-1 group-hover:text-acento" />
          </Link>
        ))}
      </div>
    </MarcoCuenta>
  )
}

export function PedidoDetalle() {
  const { id } = useParams()
  const pedido = pedidosSimulados.find((p) => p.id === id)

  if (!pedido) {
    return (
      <MarcoCuenta titulo="Pedido no encontrado">
        <div className="rounded-3xl border border-dashed border-borde bg-white/60 py-16 text-center">
          <span className="text-5xl">🫥</span>
          <p className="mt-4 text-gris">No encontramos ese pedido.</p>
          <Button className="mt-5" to="/cuenta/pedidos">Volver a mis pedidos</Button>
        </div>
      </MarcoCuenta>
    )
  }

  const estados = ['Pendiente', 'Confirmado', 'En preparación', 'Listo para recoger', 'Entregado']
  const indiceEstado = estados.indexOf(pedido.estado)

  return (
    <MarcoCuenta titulo={`Pedido ${pedido.id}`}>
      <div className="space-y-5">
        {/* Línea de tiempo del estado */}
        <div className="rounded-3xl border border-borde/60 bg-white p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Estado del pedido</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${coloresEstado[pedido.estado]}`}>
              {pedido.estado}
            </span>
          </div>
          <ol className="space-y-0">
            {estados.map((estado, i) => {
              const alcanzado = i <= indiceEstado
              return (
                <li key={estado} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                        alcanzado ? 'bg-acento text-white' : 'border-2 border-borde bg-white text-gris/50'
                      }`}
                    >
                      {alcanzado ? '✓' : i + 1}
                    </span>
                    {i < estados.length - 1 && (
                      <span className={`h-6 w-0.5 ${i < indiceEstado ? 'bg-acento' : 'bg-borde'}`} />
                    )}
                  </div>
                  <span className={`pt-1 text-sm ${alcanzado ? 'font-bold' : 'text-gris/60'}`}>
                    {estado}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Productos del pedido */}
        <div className="rounded-3xl border border-borde/60 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-semibold">Productos</h2>
          <ul className="divide-y divide-borde/60">
            {pedido.items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-hueso text-xl ring-1 ring-borde/60">
                  {item.emoji}
                </span>
                <span className="flex-1 text-sm font-semibold">{item.nombre}</span>
                <span className="text-xs text-gris">x{item.cantidad}</span>
                <span className="font-bold">{formatoPrecio(item.precio)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-borde pt-4">
            <div className="text-sm text-gris">
              <p>{pedido.fecha}</p>
              <p>{pedido.entrega}</p>
            </div>
            <p className="text-xl font-extrabold text-acento-oscuro">{formatoPrecio(pedido.total)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variante="secundario" to="/cuenta/pedidos">← Volver a mis pedidos</Button>
          <Button to="/catalogo">Volver a pedir</Button>
        </div>
      </div>
    </MarcoCuenta>
  )
}
