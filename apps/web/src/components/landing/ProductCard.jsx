import { MessageCircle } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'

// Tarjeta genérica de producto — generaliza la antigua EmpanadaCard para
// reusarla en todas las categorías del Menú (alfajores, cuchareables,
// postres y tortas), no solo empanadas. Toda la tarjeta es el área clicable
// (mejor blanco de toque en mobile). El badge de WhatsApp queda siempre
// visible en mobile (no hay hover ahí) y se revela con hover recién en
// desktop.
export default function ProductCard({ producto }) {
  return (
    <WhatsAppCTA
      mensaje={producto.mensajeWhatsapp}
      producto={producto.id}
      className="group relative block w-full overflow-hidden rounded-[28px] bg-tinta shadow-md transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl active:scale-[0.97]"
    >
      <div className="aspect-[3/4] overflow-hidden">
        <img
          src={producto.imagen}
          alt={producto.nombre}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent px-4 pb-4 pt-14">
        <p className="font-display text-lg font-semibold leading-tight text-white sm:text-xl">{producto.nombre}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white/90">
            S/ {producto.precio.toFixed(2)}
            {producto.detalle && <span className="font-normal text-white/60"> · {producto.detalle}</span>}
          </span>
          <span className="flex shrink-0 translate-y-0 items-center gap-1.5 rounded-full bg-[#0F7B3F] px-3 py-1.5 text-xs font-bold text-white opacity-100 transition-all duration-300 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
            <MessageCircle size={13} fill="white" className="text-[#0F7B3F]" />
            Pedir
          </span>
        </div>
      </div>
    </WhatsAppCTA>
  )
}
