import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { tamanosDeTienda } from '../../utils/ordenes'

/**
 * Agregar productos sueltos a una orden: elige producto, tamaño (si tiene) y cantidad, y se suma a la lista.
 * Se usa para los postres del mayorista y para los productos de una orden de Rappi.
 */
export default function ListaProductos({ productos, lineas, onCambio, titulo, vacio }) {
  const [productoId, setProductoId] = useState('')
  const [tamano, setTamano] = useState('')
  const [cantidad, setCantidad] = useState('1')

  const producto = productos.find((p) => p.id === productoId)
  const tamanos = producto ? tamanosDeTienda(producto) : []

  const agregar = () => {
    const n = Number(cantidad)
    if (!producto || !Number.isInteger(n) || n <= 0) return
    if (tamanos.length > 0 && !tamano) return
    onCambio([...lineas, { productoId: producto.id, nombre: producto.nombre, tamano: tamanos.length > 0 ? tamano : null, cantidad: n }])
    setProductoId('')
    setTamano('')
    setCantidad('1')
  }

  const listo = producto && Number(cantidad) > 0 && (tamanos.length === 0 || tamano)
  return (
    <div>
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {lineas.length === 0 ? (
        <p className="mt-1 text-xs text-gris">{vacio}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {lineas.map((l, i) => (
            <li key={`${l.productoId}-${l.tamano}-${i}`} className="flex items-center gap-2 rounded-xl border border-borde bg-hueso px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-bold">{l.cantidad} ×</span> {l.nombre}
                {l.tamano ? <span className="text-gris"> · {l.tamano}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => onCambio(lineas.filter((_, j) => j !== i))}
                aria-label={`Quitar ${l.nombre}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gris hover:bg-borde/50"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <select
          value={productoId}
          onChange={(e) => {
            setProductoId(e.target.value)
            setTamano('')
          }}
          aria-label="Producto"
          className="h-11 min-w-0 rounded-xl border border-borde bg-hueso px-3 text-sm outline-none focus:border-acento"
        >
          <option value="">Producto…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label="Cantidad"
          className="h-11 w-16 rounded-xl border border-borde bg-hueso text-center text-sm font-bold outline-none focus:border-acento"
        />
        {tamanos.length > 0 && (
          <select
            value={tamano}
            onChange={(e) => setTamano(e.target.value)}
            aria-label="Tamaño"
            className="col-span-2 h-11 rounded-xl border border-borde bg-hueso px-3 text-sm outline-none focus:border-acento"
          >
            <option value="">Tamaño…</option>
            {tamanos.map((t) => (
              <option key={t.id} value={t.tamano}>
                {t.tamano}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={agregar}
          disabled={!listo}
          className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-tinta text-sm font-semibold text-tinta disabled:border-borde disabled:text-gris"
        >
          <Plus size={16} aria-hidden="true" />
          Agregar
        </button>
      </div>
    </div>
  )
}
