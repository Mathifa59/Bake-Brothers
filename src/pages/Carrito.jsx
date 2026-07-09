import { useState } from 'react'
import { ArrowRight, Ticket, Truck, X } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { formatoPrecio } from '../data/mock'
import CartItem from '../components/CartItem'
import Button from '../components/Button'
import SectionTitle from '../components/SectionTitle'

export default function Carrito() {
  const { items, totales, cupon, aplicarCupon, quitarCupon, cantidadTotal } = useCart()
  const [codigoCupon, setCodigoCupon] = useState('')
  const [errorCupon, setErrorCupon] = useState(false)

  const enviarCupon = (e) => {
    e.preventDefault()
    const ok = aplicarCupon(codigoCupon)
    setErrorCupon(!ok)
    if (ok) setCodigoCupon('')
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-6">
        <span className="inline-block text-8xl anim-float">🧁</span>
        <h1 className="mt-6 font-display text-4xl font-semibold">Tu carrito está vacío</h1>
        <p className="mx-auto mt-3 max-w-sm text-gris">
          Agrega tus postres favoritos. Postres frescos, suaves y preparados con cariño te están esperando.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button tamano="lg" to="/catalogo">Ver catálogo</Button>
          <Button tamano="lg" variante="secundario" to="/ofertas">Ver ofertas</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:py-14">
      <SectionTitle
        etiqueta="Un paso más cerca"
        titulo="Tu carrito"
        descripcion={`Tienes ${cantidadTotal} ${cantidadTotal === 1 ? 'producto' : 'productos'} listos para pedir.`}
        className="mb-10"
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {items.map((item) => (
            <CartItem key={item.clave} item={item} />
          ))}
        </div>

        {/* Resumen */}
        <aside className="h-fit rounded-3xl border border-borde/60 bg-white p-6 shadow-sm lg:sticky lg:top-32">
          <h2 className="font-display text-xl font-semibold">Resumen del pedido</h2>

          {/* Cupón */}
          {cupon ? (
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <span className="flex items-center gap-2 font-bold">
                <Ticket size={15} /> {cupon.codigo} — {cupon.descripcion}
              </span>
              <button onClick={quitarCupon} className="cursor-pointer hover:text-emerald-950" aria-label="Quitar cupón">
                <X size={15} />
              </button>
            </div>
          ) : (
            <form onSubmit={enviarCupon} className="mt-5">
              <div className="flex gap-2">
                <input
                  value={codigoCupon}
                  onChange={(e) => { setCodigoCupon(e.target.value); setErrorCupon(false) }}
                  placeholder="¿Tienes un cupón?"
                  className="min-w-0 flex-1 rounded-full border border-borde bg-hueso px-4 py-2.5 text-sm outline-none focus:border-acento"
                  aria-label="Código de cupón"
                />
                <Button tamano="sm" variante="oscuro" type="submit">Aplicar</Button>
              </div>
              {errorCupon && (
                <p className="mt-2 text-xs font-semibold text-red-500">
                  Cupón no válido. Prueba con <button type="button" className="underline cursor-pointer" onClick={() => setCodigoCupon('BAKE10')}>BAKE10</button> 😉
                </p>
              )}
            </form>
          )}

          <dl className="mt-5 space-y-2.5 border-t border-borde pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gris">Subtotal</dt>
              <dd className="font-bold">{formatoPrecio(totales.subtotal)}</dd>
            </div>
            {totales.descuentoCupon > 0 && (
              <div className="flex justify-between text-emerald-600">
                <dt>Descuento cupón</dt>
                <dd className="font-bold">− {formatoPrecio(totales.descuentoCupon)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="flex items-center gap-1.5 text-gris">
                <Truck size={14} /> Delivery estimado
              </dt>
              <dd className={`font-bold ${totales.delivery === 0 ? 'text-emerald-600' : ''}`}>
                {totales.delivery === 0 ? '¡Gratis!' : formatoPrecio(totales.delivery)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-borde pt-3 text-base">
              <dt className="font-display font-semibold">Total</dt>
              <dd className="text-xl font-extrabold text-acento-oscuro">{formatoPrecio(totales.total)}</dd>
            </div>
          </dl>

          {totales.delivery > 0 && (
            <p className="mt-3 rounded-2xl bg-acento-suave px-4 py-2.5 text-xs font-semibold text-acento-oscuro">
              🚚 Te faltan {formatoPrecio(Math.max(0, 150 - (totales.subtotal - totales.descuentoCupon)))} para delivery gratis
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <Button to="/checkout">
              Finalizar pedido <ArrowRight size={16} />
            </Button>
            <Button variante="secundario" to="/catalogo">Seguir comprando</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
