import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ChevronRight, Minus, Plus, ShoppingBag, MessageCircle,
  Clock, Snowflake, Users, Check,
} from 'lucide-react'
import { precioPorTamano, calcularPrecioLinea } from '@bakebrothers/domain'
import { extrasDisponibles } from '../data/mock'
import { descuentoDe, formatoPrecio } from '../utils/formato'
import { useCatalogo } from '../context/CatalogContext'
import { useCart } from '../context/CartContext'
import ProductImage from '../components/ProductImage'
import Badge from '../components/Badge'
import Button from '../components/Button'
import ProductGrid from '../components/ProductGrid'
import SectionTitle from '../components/SectionTitle'

export default function ProductoDetalle() {
  const { id } = useParams()
  const { productos } = useCatalogo()
  const producto = productos.find((p) => p.id === id)
  const { agregarItem } = useCart()

  const [cantidad, setCantidad] = useState(1)
  const [tamano, setTamano] = useState('Personal')
  const [extras, setExtras] = useState([])
  const [imagenActiva, setImagenActiva] = useState(0)

  useEffect(() => {
    setCantidad(1)
    setTamano('Personal')
    setExtras([])
    setImagenActiva(0)
  }, [id])

  if (!producto) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <span className="text-6xl">🫥</span>
        <h1 className="mt-4 font-display text-3xl font-semibold">Producto no encontrado</h1>
        <Button className="mt-6" to="/catalogo">Volver al catálogo</Button>
      </div>
    )
  }

  const desc = descuentoDe(producto)
  // El cálculo de precios vive en @bakebrothers/domain — única fuente de verdad.
  const precioFinal = calcularPrecioLinea({
    precioBase: producto.precio,
    tamano: producto.tamanos ? tamano : null,
    cantidadExtras: extras.length,
  })

  const alternarExtra = (extraId) =>
    setExtras((prev) =>
      prev.includes(extraId) ? prev.filter((e) => e !== extraId) : [...prev, extraId]
    )

  const relacionados = productos
    .filter((p) => p.id !== producto.id && (p.tipo === producto.tipo || p.categoria === producto.categoria))
    .slice(0, 4)

  // Galería: foto real como vista principal (si existe) + vistas simuladas
  const vistas = [
    producto,
    { ...producto, foto: null, emoji: '🍽️' },
    { ...producto, foto: null, emoji: '📦' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      {/* Migas de pan */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-gris" aria-label="Ruta de navegación">
        <Link to="/" className="hover:text-acento">Inicio</Link>
        <ChevronRight size={12} />
        <Link to="/catalogo" className="hover:text-acento">Catálogo</Link>
        <ChevronRight size={12} />
        <span className="font-semibold text-tinta">{producto.nombre}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Galería */}
        <div>
          <div className="group overflow-hidden rounded-[2rem] shadow-lg shadow-tinta/8 ring-1 ring-borde">
            <ProductImage
              producto={vistas[imagenActiva]}
              className="aspect-square w-full"
              tamanoEmoji="text-[10rem]"
              prioridad
            />
          </div>
          <div className="mt-4 flex gap-3">
            {vistas.map((v, i) => (
              <button
                key={i}
                onClick={() => setImagenActiva(i)}
                className={`overflow-hidden rounded-2xl ring-2 transition-all cursor-pointer ${
                  imagenActiva === i ? 'ring-acento scale-105' : 'ring-borde opacity-60 hover:opacity-100'
                }`}
                aria-label={`Ver imagen ${i + 1}`}
              >
                <ProductImage producto={v} className="h-20 w-20" tamanoEmoji="text-3xl" />
              </button>
            ))}
          </div>
        </div>

        {/* Información */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tipo="categoria">{producto.tipo}</Badge>
            {desc > 0 && <Badge tipo="oferta">-{desc}% de descuento</Badge>}
            {producto.masVendido && <Badge tipo="acento">⭐ Más vendido</Badge>}
            {!producto.disponible && <Badge tipo="agotado">Agotado por hoy</Badge>}
          </div>

          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight [text-wrap:balance]">
            {producto.nombre}
          </h1>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-4xl font-extrabold text-acento-oscuro">{formatoPrecio(precioFinal)}</span>
            {producto.precioAnterior && tamano === 'Personal' && extras.length === 0 && (
              <span className="text-lg text-gris line-through">{formatoPrecio(producto.precioAnterior)}</span>
            )}
          </div>

          <p className="mt-4 leading-relaxed text-gris">{producto.descripcion}</p>

          {/* Tamaño */}
          {producto.tamanos && (
            <div className="mt-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-gris">Tamaño</h2>
              <div className="flex gap-2">
                {['Personal', 'Mediano', 'Grande'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTamano(t)}
                    className={`flex-1 rounded-2xl border-2 px-4 py-3 text-sm font-bold transition-all cursor-pointer ${
                      tamano === t
                        ? 'border-acento bg-acento-suave text-acento-oscuro'
                        : 'border-borde bg-white text-tinta/60 hover:border-acento/40'
                    }`}
                  >
                    {t}
                    <span className="block text-[11px] font-semibold opacity-70">
                      {formatoPrecio(precioPorTamano(producto.precio, t))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Extras */}
          <div className="mt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-gris">
              Opciones extra <span className="normal-case tracking-normal">(+ S/ 8.00 c/u)</span>
            </h2>
            <div className="flex flex-col gap-2">
              {extrasDisponibles.map((e) => (
                <button
                  key={e.id}
                  onClick={() => alternarExtra(e.id)}
                  className={`flex items-center justify-between rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${
                    extras.includes(e.id)
                      ? 'border-acento bg-acento-suave text-acento-oscuro'
                      : 'border-borde bg-white text-tinta/70 hover:border-acento/40'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full ${
                        extras.includes(e.id) ? 'bg-acento text-white' : 'border-2 border-borde'
                      }`}
                    >
                      {extras.includes(e.id) && <Check size={12} />}
                    </span>
                    {e.texto}
                  </span>
                  <span className="text-xs">{formatoPrecio(e.precio)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad + acciones */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-borde bg-white px-2 py-1.5">
              <button
                onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-crema cursor-pointer"
                aria-label="Disminuir cantidad"
              >
                <Minus size={16} />
              </button>
              <span className="w-10 text-center text-lg font-extrabold">{cantidad}</span>
              <button
                onClick={() => setCantidad(cantidad + 1)}
                className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-crema cursor-pointer"
                aria-label="Aumentar cantidad"
              >
                <Plus size={16} />
              </button>
            </div>
            <Button
              tamano="lg"
              className="flex-1 min-w-48"
              disabled={!producto.disponible}
              onClick={() =>
                agregarItem(producto, cantidad, producto.tamanos ? tamano : null, extras)
              }
            >
              <ShoppingBag size={17} />
              {producto.disponible ? `Agregar · ${formatoPrecio(precioFinal * cantidad)}` : 'No disponible'}
            </Button>
          </div>
          <a
            href={`https://wa.me/51987654321?text=${encodeURIComponent(`Hola Bake Brothers 👋 Quiero pedir: ${producto.nombre}`)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-4 text-sm font-bold text-white transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <MessageCircle size={17} fill="white" className="text-[#25D366]" /> Pedir por WhatsApp
          </a>

          {/* Información adicional */}
          <dl className="mt-7 grid gap-3 rounded-3xl border border-borde/60 bg-white p-5 sm:grid-cols-3">
            {[
              [Clock, 'Preparación', producto.preparacion],
              [Snowflake, 'Conservación', producto.conservacion],
              [Users, 'Porciones', producto.porciones],
            ].map(([Icono, titulo, valor]) => (
              <div key={titulo} className="flex gap-2.5">
                <Icono size={17} className="mt-0.5 shrink-0 text-acento" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-gris">{titulo}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-tinta/80">{valor}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Relacionados */}
      {relacionados.length > 0 && (
        <section className="mt-20">
          <SectionTitle etiqueta="También te puede gustar" titulo="Productos relacionados" className="mb-8" />
          <ProductGrid productos={relacionados} />
        </section>
      )}
    </div>
  )
}
