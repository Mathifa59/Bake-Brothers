import { MessageCircle } from 'lucide-react'
import { whatsappUrl } from '../utils/whatsapp'

export default function WhatsAppFloat() {
  return (
    <a
      href={whatsappUrl('Hola Bake Brothers, quiero hacer un pedido 🎂')}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] py-3 pl-3.5 pr-5 font-bold text-white shadow-xl shadow-[#25D366]/40 transition-all hover:scale-105 hover:shadow-2xl"
      aria-label="Escríbenos por WhatsApp"
    >
      <MessageCircle size={22} fill="white" className="text-[#25D366]" />
      <span className="hidden text-sm sm:block">¡Pide por WhatsApp!</span>
    </a>
  )
}
