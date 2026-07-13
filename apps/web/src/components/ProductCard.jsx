import { Link } from 'react-router-dom'
import { ShoppingBag, Eye } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { descuentoDe, formatoPrecio } from '../utils/formato'
import ProductImage from './ProductImage'
import Badge from './Badge'
import Button from './Button'

export default function ProductCard({ producto }) {
  const { agregarItem } = useCart()
  const desc = descuentoDe(producto)

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-borde/60 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-tinta/8">
      <Link to={`/producto/${producto.id}`} className="relative block">
        <ProductImage producto={producto} className="aspect-[4/3] w-full" />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {desc > 0 && <Badge tipo="oferta">-{desc}%</Badge>}
          {producto.masVendido && <Badge tipo="claro">⭐ Más vendido</Badge>}
          {!producto.disponible && <Badge tipo="agotado">Agotado</Badge>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <Badge tipo="categoria" className="self-start">{producto.tipo}</Badge>
        <Link
          to={`/producto/${producto.id}`}
          className="font-display text-lg font-semibold leading-snug text-tinta transition-colors hover:text-acento"
        >
          {producto.nombre}
        </Link>

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-xl font-extrabold text-tinta">{formatoPrecio(producto.precio)}</span>
          {producto.precioAnterior && (
            <span className="text-sm text-gris line-through">
              {formatoPrecio(producto.precioAnterior)}
            </span>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            tamano="sm"
            className="flex-1"
            disabled={!producto.disponible}
            onClick={() => agregarItem(producto)}
          >
            <ShoppingBag size={15} /> Agregar
          </Button>
          <Button
            tamano="sm"
            variante="secundario"
            to={`/producto/${producto.id}`}
            aria-label={`Ver detalle de ${producto.nombre}`}
          >
            <Eye size={15} />
          </Button>
        </div>
      </div>
    </article>
  )
}
