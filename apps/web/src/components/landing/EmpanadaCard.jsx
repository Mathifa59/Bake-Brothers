import { MessageCircle } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'

// Toda la tarjeta es el área clicable (no solo un botón chico) — mejor
// blanco de toque en mobile. El badge de WhatsApp queda siempre visible en
// mobile (no hay hover ahí) y se revela con hover recién en desktop, como
// pide la tarea.
export default function EmpanadaCard({ empanada }) {
  return (
    <WhatsAppCTA
      mensaje={empanada.mensajeWhatsapp}
      producto={empanada.id}
      className="group relative block w-[220px] shrink-0 overflow-hidden rounded-[28px] bg-tinta shadow-md transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl active:scale-[0.97] sm:w-[260px]"
    >
      <div className="aspect-[3/4] overflow-hidden">
        <img
          src={empanada.imagen}
          alt={`Empanada de ${empanada.nombre.toLowerCase()}, recién horneada`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent px-4 pb-4 pt-14">
        <p className="font-display text-lg font-semibold leading-tight text-white sm:text-xl">{empanada.nombre}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/90">S/ {empanada.precio.toFixed(2)}</span>
          <span className="flex translate-y-0 items-center gap-1.5 rounded-full bg-[#0F7B3F] px-3 py-1.5 text-xs font-bold text-white opacity-100 transition-all duration-300 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
            <MessageCircle size={13} fill="white" className="text-[#0F7B3F]" />
            Pedir
          </span>
        </div>
      </div>
    </WhatsAppCTA>
  )
}
