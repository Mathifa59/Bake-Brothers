import { Flame } from 'lucide-react'
import { ofertas } from '../data/mock'
import OfferCard from '../components/OfferCard'

export default function Ofertas() {
  return (
    <div>
      {/* Banner superior */}
      <section className="relative overflow-hidden bg-tinta py-16 text-center text-white">
        <span className="pointer-events-none absolute -left-10 top-4 text-8xl opacity-15 rotate-[-15deg]">🍰</span>
        <span className="pointer-events-none absolute -right-8 bottom-2 text-8xl opacity-15 rotate-12">🧁</span>
        <div className="relative mx-auto max-w-2xl px-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-acento px-4 py-1.5 text-xs font-black uppercase tracking-widest">
            <Flame size={13} /> Solo esta semana
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold md:text-6xl [text-wrap:balance]">
            Ofertas artesanales
            <em className="block font-light italic text-acento">por tiempo limitado</em>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-white/60">
            Los mismos postres de siempre, hechos con el mismo cariño, a precios
            que dan más ganas de compartir.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ofertas.map((p, i) => (
            <div key={p.id} className={`anim-fade-up delay-${(i % 4) + 1}`}>
              <OfferCard producto={p} />
            </div>
          ))}
        </div>

        <p className="mt-10 rounded-3xl bg-acento-suave px-6 py-5 text-center text-sm font-semibold text-acento-oscuro ring-1 ring-acento/20">
          🎟️ ¿Quieres un descuento extra? Usa el cupón <strong>BAKE10</strong> en tu carrito
          y llévate 10% adicional en toda tu compra.
        </p>
      </section>
    </div>
  )
}
