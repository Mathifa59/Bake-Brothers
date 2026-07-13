import ProductCard from './ProductCard'

export default function ProductGrid({ productos, columnas = 4 }) {
  const cols =
    columnas === 3
      ? 'sm:grid-cols-2 lg:grid-cols-3'
      : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  if (productos.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-borde bg-white/60 py-20 text-center">
        <span className="text-5xl">🔍</span>
        <p className="mt-4 font-display text-xl font-semibold">No encontramos productos</p>
        <p className="mt-1 text-sm text-gris">Prueba con otros filtros o términos de búsqueda.</p>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 gap-5 ${cols}`}>
      {productos.map((p) => (
        <ProductCard key={p.id} producto={p} />
      ))}
    </div>
  )
}
