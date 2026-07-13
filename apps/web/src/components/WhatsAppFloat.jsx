import { MessageCircle } from 'lucide-react'

export default function WhatsAppFloat() {
  return (
    <a
      href="https://wa.me/51987654321?text=Hola%20Bake%20Brothers%2C%20quiero%20hacer%20un%20pedido%20%F0%9F%8E%82"
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
