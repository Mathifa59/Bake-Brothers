import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { descuentoDe } from '../utils/formato'
import { useCatalogo } from '../context/CatalogContext'
import ProductGrid from '../components/ProductGrid'
import SectionTitle from '../components/SectionTitle'
import Badge from '../components/Badge'

const tiposDisponibles = ['Todos', 'Tortas', 'Postres', 'Dulces', 'Salados', 'Bocaditos', 'Catering']
const rangosPrecio = [
  { id: 'todos', texto: 'Todos los precios', min: 0, max: Infinity },
  { id: 'hasta-30', texto: 'Hasta S/ 30', min: 0, max: 30 },
  { id: '30-70', texto: 'S/ 30 – S/ 70', min: 30, max: 70 },
  { id: '70-150', texto: 'S/ 70 – S/ 150', min: 70, max: 150 },
  { id: 'mas-150', texto: 'Más de S/ 150', min: 150, max: Infinity },
]
const ordenamientos = [
  { id: 'recientes', texto: 'Más recientes' },
  { id: 'precio-asc', texto: 'Precio: menor a mayor' },
  { id: 'precio-desc', texto: 'Precio: mayor a menor' },
  { id: 'populares', texto: 'Más populares' },
]

export default function Catalogo() {
  const { productos } = useCatalogo()
  const [searchParams, setSearchParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState('Todos')
  const [precio, setPrecio] = useState('todos')
  const [soloDisponibles, setSoloDisponibles] = useState(false)
  const [soloMasVendidos, setSoloMasVendidos] = useState(false)
  const [soloOfertas, setSoloOfertas] = useState(false)
  const [orden, setOrden] = useState('recientes')
  const [filtrosMovil, setFiltrosMovil] = useState(false)

  // Sincroniza filtros con la URL (menú Dulces/Salados y cards de categoría)
  useEffect(() => {
    const cat = searchParams.get('categoria')
    const tipoUrl = searchParams.get('tipo')
    const q = searchParams.get('q')
    if (tipoUrl && tiposDisponibles.includes(tipoUrl)) setTipo(tipoUrl)
    else setTipo('Todos')
    setBusqueda(q || '')
  }, [searchParams])

  const categoriaUrl = searchParams.get('categoria')

  const resultado = useMemo(() => {
    const rango = rangosPrecio.find((r) => r.id === precio)
    let lista = productos.filter((p) => {
      if (categoriaUrl && p.categoria !== categoriaUrl) return false
      if (tipo !== 'Todos' && p.tipo !== tipo) return false
      if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
      if (p.precio < rango.min || p.precio > rango.max) return false
      if (soloDisponibles && !p.disponible) return false
      if (soloMasVendidos && !p.masVendido) return false
      if (soloOfertas && !p.precioAnterior) return false
      return true
    })
    if (orden === 'precio-asc') lista = [...lista].sort((a, b) => a.precio - b.precio)
    if (orden === 'precio-desc') lista = [...lista].sort((a, b) => b.precio - a.precio)
    if (orden === 'populares')
      lista = [...lista].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0))
    return lista
  }, [busqueda, tipo, precio, soloDisponibles, soloMasVendidos, soloOfertas, orden, categoriaUrl])

  const limpiarCategoria = () => {
    searchParams.delete('categoria')
    searchParams.delete('tipo')
    setSearchParams(searchParams)
    setTipo('Todos')
  }

  const Filtros = () => (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-gris">Categoría</h3>
        <div className="flex flex-wrap gap-2">
          {tiposDisponibles.map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                tipo === t
                  ? 'bg-tinta text-white'
                  : 'bg-white text-tinta/70 ring-1 ring-borde hover:ring-acento hover:text-acento'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-gris">Precio</h3>
        <div className="space-y-1.5">
          {rangosPrecio.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="precio"
                checked={precio === r.id}
                onChange={() => setPrecio(r.id)}
                className="h-4 w-4 accent-acento"
              />
              <span className={precio === r.id ? 'font-bold' : 'text-tinta/70'}>{r.texto}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-gris">Más filtros</h3>
        <div className="space-y-2">
          {[
            ['Solo disponibles', soloDisponibles, setSoloDisponibles],
            ['Más vendidos', soloMasVendidos, setSoloMasVendidos],
            ['En oferta', soloOfertas, setSoloOfertas],
          ].map(([texto, valor, setter]) => (
            <label key={texto} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={valor}
                onChange={(e) => setter(e.target.checked)}
                className="h-4 w-4 rounded accent-acento"
              />
              <span className={valor ? 'font-bold' : 'text-tinta/70'}>{texto}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <SectionTitle
          etiqueta="Nuestra vitrina"
          titulo="Catálogo"
          descripcion="Todo lo que horneamos, en un solo lugar. Hecho artesanalmente para compartir."
        />
        {categoriaUrl && (
          <button
            onClick={limpiarCategoria}
            className="flex items-center gap-1.5 rounded-full bg-acento-suave px-4 py-2 text-xs font-bold text-acento-oscuro transition-colors hover:bg-acento hover:text-white cursor-pointer"
          >
            Mostrando: {categoriaUrl} <X size={13} />
          </button>
        )}
      </div>

      {/* Buscador + orden */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gris" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca tortas, cheesecakes, bocaditos…"
            className="w-full rounded-full border border-borde bg-white py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-acento focus:ring-2 focus:ring-acento/20"
            aria-label="Buscar productos"
          />
        </div>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="cursor-pointer rounded-full border border-borde bg-white px-4 py-3 text-sm font-semibold outline-none transition-all focus:border-acento"
          aria-label="Ordenar productos"
        >
          {ordenamientos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.texto}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFiltrosMovil(!filtrosMovil)}
          className="flex items-center justify-center gap-2 rounded-full border border-borde bg-white px-5 py-3 text-sm font-bold lg:hidden cursor-pointer"
        >
          <SlidersHorizontal size={15} /> Filtros
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        {/* Filtros laterales */}
        <aside className={`${filtrosMovil ? 'block' : 'hidden'} rounded-3xl border border-borde/60 bg-white p-6 lg:block lg:self-start lg:sticky lg:top-32`}>
          <Filtros />
        </aside>

        <div>
          <p className="mb-4 text-sm text-gris">
            <strong className="text-tinta">{resultado.length}</strong>{' '}
            {resultado.length === 1 ? 'producto encontrado' : 'productos encontrados'}
            {busqueda && (
              <>
                {' '}para “<strong className="text-tinta">{busqueda}</strong>”
              </>
            )}
          </p>
          <ProductGrid productos={resultado} columnas={3} />
        </div>
      </div>
    </div>
  )
}
