import { useState } from 'react'
import { MapPin, Clock, Phone, Instagram, Facebook, MessageCircle } from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import Button from '../components/Button'
import Input from '../components/Input'

export default function Contacto() {
  const [enviado, setEnviado] = useState(false)
  const [form, setForm] = useState({ nombre: '', correo: '', telefono: '', mensaje: '' })
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:py-16">
      <SectionTitle
        centrado
        etiqueta="Hablemos"
        titulo="Contáctanos"
        descripcion="¿Dudas, pedidos especiales o solo antojo? Escríbenos, respondemos rapidito."
        className="mb-12"
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Formulario */}
        <div className="rounded-[2rem] border border-borde/60 bg-white p-6 shadow-sm md:p-8">
          {enviado ? (
            <div className="anim-pop py-10 text-center">
              <span className="text-6xl">💌</span>
              <h3 className="mt-4 font-display text-2xl font-semibold">¡Mensaje enviado!</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-gris">
                Gracias por escribirnos. Te responderemos dentro de las próximas 24 horas.
              </p>
              <Button variante="secundario" className="mt-6" onClick={() => setEnviado(false)}>
                Enviar otro mensaje
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setEnviado(true) }} className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">Envíanos un mensaje</h2>
              <Input label="Nombre *" placeholder="Tu nombre" required value={form.nombre} onChange={set('nombre')} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Correo *" type="email" placeholder="tucorreo@ejemplo.com" required value={form.correo} onChange={set('correo')} />
                <Input label="Teléfono" type="tel" placeholder="999 999 999" value={form.telefono} onChange={set('telefono')} />
              </div>
              <Input label="Mensaje *" textarea required placeholder="Cuéntanos qué necesitas…" value={form.mensaje} onChange={set('mensaje')} />
              <Button tamano="lg" type="submit" className="w-full">Enviar mensaje</Button>
            </form>
          )}
        </div>

        {/* Información */}
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-borde/60 bg-white p-6 md:p-8">
            <h2 className="mb-5 font-display text-2xl font-semibold">Encuéntranos</h2>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-acento" />
                <span>
                  <strong className="block">Dirección</strong>
                  <span className="text-gris">Av. Los Pasteles 456, Miraflores — Lima, Perú</span>
                </span>
              </li>
              <li className="flex gap-3">
                <Clock size={18} className="mt-0.5 shrink-0 text-acento" />
                <span>
                  <strong className="block">Horario de atención</strong>
                  <span className="text-gris">Lun – Sáb: 9:00 am – 8:00 pm · Dom: 9:00 am – 2:00 pm</span>
                </span>
              </li>
              <li className="flex gap-3">
                <Phone size={18} className="mt-0.5 shrink-0 text-acento" />
                <span>
                  <strong className="block">WhatsApp</strong>
                  <span className="text-gris">+51 987 654 321</span>
                </span>
              </li>
            </ul>

            <div className="mt-6 flex flex-wrap gap-2">
              <a
                href="https://wa.me/51987654321"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white transition-transform hover:scale-105"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
              <a
                href="#instagram"
                className="flex items-center gap-2 rounded-full bg-tinta px-4 py-2.5 text-xs font-bold text-white transition-transform hover:scale-105"
              >
                <Instagram size={14} /> @bakebrothers.pe
              </a>
              <a
                href="#facebook"
                className="flex items-center gap-2 rounded-full bg-[#1877F2] px-4 py-2.5 text-xs font-bold text-white transition-transform hover:scale-105"
              >
                <Facebook size={14} /> Bake Brothers
              </a>
            </div>
          </div>

          {/* Mapa simulado */}
          <div
            className="relative grid h-64 place-items-center overflow-hidden rounded-[2rem] ring-1 ring-borde"
            style={{
              background:
                'repeating-linear-gradient(0deg, #EAE6E0 0 2px, #F1EDE8 2px 40px), repeating-linear-gradient(90deg, #EAE6E0 0 2px, #F1EDE8 2px 40px)',
            }}
            role="img"
            aria-label="Mapa de ubicación de la tienda (referencial)"
          >
            <span className="absolute left-[18%] top-[30%] h-16 w-24 rounded-xl bg-[#DDE7D6]" />
            <span className="absolute right-[15%] top-[15%] h-12 w-20 rounded-xl bg-[#DDE7D6]" />
            <span className="absolute bottom-[18%] left-[30%] h-14 w-28 rounded-xl bg-[#E3DED5]" />
            <span className="absolute left-0 top-1/2 h-3 w-full -translate-y-1/2 bg-white/70" />
            <span className="absolute left-1/2 top-0 h-full w-3 -translate-x-1/2 bg-white/70" />
            <div className="relative z-10 flex flex-col items-center">
              <span className="anim-float grid h-14 w-14 place-items-center rounded-full bg-acento text-2xl text-white shadow-xl shadow-acento/40">
                📍
              </span>
              <span className="mt-2 rounded-full bg-white px-4 py-1.5 text-xs font-bold shadow-md">
                Bake Brothers · Miraflores
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
