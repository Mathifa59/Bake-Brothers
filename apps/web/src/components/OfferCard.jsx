import { Link } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { descuentoDe, formatoPrecio } from '../utils/formato'
import ProductImage from './ProductImage'
import Badge from './Badge'
import Button from './Button'

export default function OfferCard({ producto }) {
  const { agregarItem } = useCart()
  const desc = descuentoDe(producto)

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-md shadow-tinta/5 ring-1 ring-borde/60 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-acento/15 hover:ring-acento/40">
      <Link to={`/producto/${producto.id}`} className="relative block">
        <ProductImage producto={producto} className="aspect-square w-full" tamanoEmoji="text-8xl" />
        <span className="absolute right-3 top-3 grid h-13 w-13 place-items-center rounded-full bg-acento px-2 py-2 text-sm font-black text-white shadow-lg shadow-acento/40 rotate-6 transition-transform group-hover:rotate-0">
          -{desc}%
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <Badge tipo="acento" className="self-start">Oferta de la semana</Badge>
        <Link
          to={`/producto/${producto.id}`}
          className="font-display text-lg font-semibold leading-snug transition-colors hover:text-acento"
        >
          {producto.nombre}
        </Link>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-acento-oscuro">
            {formatoPrecio(producto.precio)}
          </span>
          <span className="text-sm text-gris line-through">
            {formatoPrecio(producto.precioAnterior)}
          </span>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button tamano="sm" onClick={() => agregarItem(producto)}>
            <ShoppingBag size={15} /> Agregar al carrito
          </Button>
          <Button tamano="sm" variante="secundario" to={`/producto/${producto.id}`}>
            Ver detalle
          </Button>
        </div>
      </div>
    </article>
  )
}
