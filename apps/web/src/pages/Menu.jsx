import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import ProductCard from '../components/landing/ProductCard'
import WhatsAppCTA from '../components/landing/WhatsAppCTA'
import { categorias } from '../config/menu'

// Lista simple para categorías sin foto real (hoy solo Bebidas) — en vez de
// inventar una imagen, se muestra como lista de nombre + precio (mismo
// criterio ya usado en el proyecto: no wirear fotos sin confianza alta).
function ListaSinFoto({ productos }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {productos.map((producto) => (
        <WhatsAppCTA
          key={producto.id}
          mensaje={producto.mensajeWhatsapp}
          producto={producto.id}
          className="group flex items-center justify-between gap-3 rounded-2xl border border-borde/60 bg-white px-5 py-4 transition-colors hover:border-acento/50"
        >
          <span>
            <span className="block font-display text-base font-semibold text-tinta">{producto.nombre}</span>
            {producto.nota && <span className="mt-0.5 block text-xs text-gris">{producto.nota}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-tinta/80">S/ {producto.precio.toFixed(2)}</span>
            <MessageCircle size={16} className="text-[#0F7B3F] opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
        </WhatsAppCTA>
      ))}
    </div>
  )
}

export default function Menu() {
  const [activaId, setActivaId] = useState(categorias[0].id)
  const activa = categorias.find((c) => c.id === activaId)

  return (
    <section className="bg-crema px-6 py-16 sm:px-12 sm:py-20 lg:px-20">
      <div className="mb-10">
        <h1 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Nuestro menú</h1>
        <p className="mt-3 max-w-lg text-gris">Todo lo que preparamos, en un solo lugar — elige una categoría y pide directo por WhatsApp.</p>
      </div>

      {/* Pestañas de categoría — scroll horizontal en mobile si no entran.
          Activa: fondo bien oscuro (no el naranja de acento — blanco sobre
          acento da solo ~2.5:1, bajo el 4.5:1 que exige WCAG para texto). */}
      <div className="-mx-6 mb-7 flex gap-2 overflow-x-auto px-6 pb-4 sm:mx-0 sm:mb-10 sm:flex-wrap sm:px-0 sm:pb-0">
        {categorias.map((categoria) => (
          <button
            key={categoria.id}
            type="button"
            onClick={() => setActivaId(categoria.id)}
            className={`shrink-0 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
              categoria.id === activaId
                ? 'border-tinta bg-tinta text-white'
                : 'border-borde bg-white text-tinta/70 hover:border-tinta/30'
            }`}
          >
            {categoria.nombre}
          </button>
        ))}
      </div>

      <p className="mb-8 max-w-lg text-gris">{activa.descripcion}</p>

      {activa.sinFoto ? (
        <ListaSinFoto productos={activa.productos} />
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-14 xl:grid-cols-4 xl:gap-x-10">
          {activa.productos.map((producto) => (
            <ProductCard key={producto.id} producto={producto} />
          ))}
        </div>
      )}
    </section>
  )
}
