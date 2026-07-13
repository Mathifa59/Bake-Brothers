import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { formatoPrecio } from '../data/mock'
import ProductImage from './ProductImage'

export default function CartItem({ item, compacto = false }) {
  const { cambiarCantidad, quitarItem, precioLinea } = useCart()
  const precio = precioLinea(item)

  return (
    <div className={`flex gap-3 ${compacto ? '' : 'rounded-3xl border border-borde/60 bg-white p-4 shadow-sm'}`}>
      <Link to={`/producto/${item.producto.id}`} className="group shrink-0">
        <ProductImage
          producto={item.producto}
          className={`${compacto ? 'h-16 w-16' : 'h-20 w-20 md:h-24 md:w-24'} rounded-2xl`}
          tamanoEmoji="text-3xl"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/producto/${item.producto.id}`}
              className={`block truncate font-display font-semibold text-tinta hover:text-acento ${compacto ? 'text-sm' : ''}`}
            >
              {item.producto.nombre}
            </Link>
            {(item.tamano || item.extras?.length > 0) && (
              <p className="mt-0.5 truncate text-xs text-gris">
                {[item.tamano, ...(item.extras || [])].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="mt-0.5 text-xs text-gris">{formatoPrecio(precio)} c/u</p>
          </div>
          <button
            onClick={() => quitarItem(item.clave)}
            className="shrink-0 rounded-full p-1.5 text-gris transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
            aria-label={`Eliminar ${item.producto.nombre} del carrito`}
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-1 rounded-full border border-borde bg-hueso px-1 py-0.5">
            <button
              onClick={() => cambiarCantidad(item.clave, -1)}
              className="grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-white hover:text-acento cursor-pointer"
              aria-label="Disminuir cantidad"
            >
              <Minus size={13} />
            </button>
            <span className="w-6 text-center text-sm font-bold">{item.cantidad}</span>
            <button
              onClick={() => cambiarCantidad(item.clave, 1)}
              className="grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-white hover:text-acento cursor-pointer"
              aria-label="Aumentar cantidad"
            >
              <Plus size={13} />
            </button>
          </div>
          <span className={`font-extrabold text-tinta ${compacto ? 'text-sm' : ''}`}>
            {formatoPrecio(precio * item.cantidad)}
          </span>
        </div>
      </div>
    </div>
  )
}
