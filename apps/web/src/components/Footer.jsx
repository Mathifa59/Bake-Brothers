import { Link } from 'react-router-dom'
import { Clock, Instagram, Facebook, MapPin, Phone } from 'lucide-react'
import Logo from './Logo'

const pagos = [
  { nombre: 'Yape', clase: 'bg-[#742284] text-white' },
  { nombre: 'Plin', clase: 'bg-[#00BFA5] text-white' },
  { nombre: 'Transferencia', clase: 'bg-white/10 text-white' },
  { nombre: 'Visa / MC', clase: 'bg-white/10 text-white' },
]

export default function Footer() {
  return (
    <footer className="mt-20 bg-tinta text-white">
      {/* Cinta decorativa */}
      <div className="h-1.5 bg-gradient-to-r from-acento via-amber-300 to-acento" />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:px-6 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo claro />
          <p className="text-sm leading-relaxed text-white/60">
            Pastelería artesanal hecha con cariño. Tortas, postres, bocaditos y
            catering para tus momentos especiales.
          </p>
          <div className="flex gap-2">
            <a
              href="#instagram"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-acento"
              aria-label="Instagram de Bake Brothers"
            >
              <Instagram size={17} />
            </a>
            <a
              href="#facebook"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-acento"
              aria-label="Facebook de Bake Brothers"
            >
              <Facebook size={17} />
            </a>
            <a
              href="#whatsapp"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-[#25D366]"
              aria-label="WhatsApp de Bake Brothers"
            >
              <Phone size={17} />
            </a>
          </div>
        </div>

        <nav aria-label="Menú rápido">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-acento">Menú rápido</h3>
          <ul className="space-y-2.5 text-sm text-white/70">
            {[
              ['Inicio', '/'],
              ['Catálogo', '/catalogo'],
              ['Ofertas', '/ofertas'],
              ['Catering', '/catering'],
              ['Sobre nosotros', '/nosotros'],
              ['Contacto', '/contacto'],
              ['Mi cuenta', '/cuenta'],
            ].map(([texto, ruta]) => (
              <li key={ruta}>
                <Link to={ruta} className="transition-colors hover:text-acento">
                  {texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-acento">Visítanos</h3>
          <ul className="space-y-3.5 text-sm text-white/70">
            <li className="flex gap-2.5">
              <MapPin size={16} className="mt-0.5 shrink-0 text-acento" />
              <span>
                Av. Los Pasteles 456, Miraflores
                <br />
                Lima, Perú
              </span>
            </li>
            <li className="flex gap-2.5">
              <Clock size={16} className="mt-0.5 shrink-0 text-acento" />
              <span>
                Lun – Sáb: 9:00 am – 8:00 pm
                <br />
                Dom: 9:00 am – 2:00 pm
              </span>
            </li>
            <li className="flex gap-2.5">
              <Phone size={16} className="mt-0.5 shrink-0 text-acento" />
              <span>WhatsApp: +51 987 654 321</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-acento">Métodos de pago</h3>
          <div className="flex flex-wrap gap-2">
            {pagos.map((p) => (
              <span
                key={p.nombre}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold ${p.clase} ring-1 ring-white/10`}
              >
                {p.nombre}
              </span>
            ))}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-white/40">
            Pide hoy y coordina tu entrega. Aceptamos pagos digitales, transferencia
            bancaria y pago contra entrega.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 py-5 text-center text-xs text-white/40">
        © 2026 Bake Brothers · Pastelería Artesanal · Hecho con 🧡 en Lima, Perú
      </div>
    </footer>
  )
}
