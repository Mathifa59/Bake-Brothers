import { MessageCircle } from 'lucide-react'
import WhatsAppCTA from './WhatsAppCTA'
import { mensajeWhatsappGenerico } from '../../config/landing'

// Reemplaza al WhatsAppFloat.jsx de la tienda vieja (queda intacto, sin
// tocar, por si se retoma) — mismo botón verde de siempre, pero con el
// pulso de "respiración" que pide la landing y el tracking de WhatsAppCTA.
//
// `oculto`: cada sección con su propio CTA en esa misma esquina (ver
// VideosHero.jsx) lo apaga mientras está en pantalla, para no taparlo —
// fade con opacity/scale (nunca display:none de golpe, ni display/visibility
// que no se puedan animar) y pointer-events-none para que no capture clics
// mientras está invisible.
export default function WhatsAppFloatButton({ oculto = false }) {
  return (
    <WhatsAppCTA
      mensaje={mensajeWhatsappGenerico}
      producto="flotante"
      ariaLabel="Pedir por WhatsApp"
      className={`group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#0F7B3F] py-3 pl-3.5 pr-5 font-bold text-white shadow-xl shadow-[#0F7B3F]/40 transition-all duration-300 hover:scale-105 active:scale-95 ${
        oculto ? 'pointer-events-none translate-y-3 scale-90 opacity-0' : 'anim-respirar opacity-100'
      }`}
    >
      <MessageCircle size={22} fill="white" className="text-[#0F7B3F]" />
      <span className="hidden text-sm sm:block">¡Pide por WhatsApp!</span>
    </WhatsAppCTA>
  )
}
