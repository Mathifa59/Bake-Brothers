import { X, ShoppingBag, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatoPrecio } from '../utils/formato'
import CartItem from './CartItem'
import Button from './Button'

export default function CartDrawer() {
  const { items, drawerAbierto, cerrarDrawer, totales, cantidadTotal } = useCart()
  const navigate = useNavigate()

  if (!drawerAbierto) return null

  const irA = (ruta) => {
    cerrarDrawer()
    navigate(ruta)
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Carrito de compras">
      <div className="anim-fade-in absolute inset-0 bg-tinta/40 backdrop-blur-sm" onClick={cerrarDrawer} />

      <aside className="anim-slide-in-right absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-hueso shadow-2xl">
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <ShoppingBag size={20} className="text-acento" />
            Tu carrito
            {cantidadTotal > 0 && (
              <span className="rounded-full bg-acento-suave px-2.5 py-0.5 text-xs font-bold text-acento-oscuro">
                {cantidadTotal}
              </span>
            )}
          </h2>
          <button
            onClick={cerrarDrawer}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-tinta/5 cursor-pointer"
            aria-label="Cerrar carrito"
          >
            <X size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="text-6xl anim-float">🧁</span>
            <p className="font-display text-xl font-semibold">Tu carrito está vacío</p>
            <p className="text-sm text-gris">Agrega tus postres favoritos y endulza tu día.</p>
            <Button className="mt-2" onClick={() => irA('/catalogo')}>
              Ver catálogo
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {items.map((item) => (
                <CartItem key={item.clave} item={item} compacto />
              ))}
            </div>

            <div className="border-t border-borde bg-white px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-gris">Subtotal</span>
                <span className="font-bold">{formatoPrecio(totales.subtotal)}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => irA('/checkout')}>
                  Finalizar pedido <ArrowRight size={16} />
                </Button>
                <Button variante="secundario" onClick={() => irA('/carrito')}>
                  Ver carrito completo
                </Button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
