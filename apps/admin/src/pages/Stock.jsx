import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Arma la lista plana de SKUs: un producto sin tamaños es un solo SKU
// (product_size_id null); un producto con tamaños es un SKU por tamaño —
// mismo criterio que la tabla `stock` (ver 0004_rediseno_alcance.sql).
function armarSkus(productos, tamanos) {
  const tamanosPorProducto = new Map()
  for (const t of tamanos) {
    if (!tamanosPorProducto.has(t.product_id)) tamanosPorProducto.set(t.product_id, [])
    tamanosPorProducto.get(t.product_id).push(t)
  }
  const skus = []
  for (const p of productos) {
    const suyos = tamanosPorProducto.get(p.id)
    if (!suyos || suyos.length === 0) {
      skus.push({ key: p.id, productId: p.id, productSizeId: null, nombre: p.nombre, categoria: p.categoria_negocio })
    } else {
      for (const t of suyos) {
        skus.push({
          key: `${p.id}:${t.id}`,
          productId: p.id,
          productSizeId: t.id,
          nombre: `${p.nombre} — ${t.tamano}`,
          categoria: p.categoria_negocio,
        })
      }
    }
  }
  return skus.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
}

export default function Stock() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'

  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState(esAdmin ? null : perfil?.sedeId ?? null)
  const [skus, setSkus] = useState(null)
  const [stockPorSku, setStockPorSku] = useState(new Map()) // key -> { id, disponible, cantidad }
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(null)

  useEffect(() => {
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        setSedes(data)
        if (esAdmin && !sedeId && data.length > 0) setSedeId(data[0].id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id, nombre, categoria_negocio').order('nombre'),
      supabase.from('product_sizes').select('id, product_id, tamano').not('precio', 'is', null),
    ]).then(([productos, tamanos]) => {
      if (productos.error) return setError(productos.error.message)
      if (tamanos.error) return setError(tamanos.error.message)
      setSkus(armarSkus(productos.data, tamanos.data))
    })
  }, [])

  const cargarStockDeSede = (sede) => {
    if (!sede) return
    supabase
      .from('stock')
      .select('id, product_id, product_size_id, disponible, cantidad')
      .eq('sede_id', sede)
      .then(({ data, error }) => {
        if (error) return setError(error.message)
        const mapa = new Map()
        for (const s of data) {
          const key = s.product_size_id ? `${s.product_id}:${s.product_size_id}` : s.product_id
          mapa.set(key, s)
        }
        setStockPorSku(mapa)
      })
  }

  useEffect(() => cargarStockDeSede(sedeId), [sedeId])

  const toggleDisponible = async (sku) => {
    setGuardando(sku.key)
    const existente = stockPorSku.get(sku.key)
    const nuevoValor = existente ? !existente.disponible : false // sin fila = disponible implícito; el primer toggle marca agotado
    let resultado
    if (existente) {
      resultado = await supabase.from('stock').update({ disponible: nuevoValor, actualizado_en: new Date().toISOString() }).eq('id', existente.id).select().single()
    } else {
      resultado = await supabase
        .from('stock')
        .insert({ sede_id: sedeId, product_id: sku.productId, product_size_id: sku.productSizeId, disponible: nuevoValor })
        .select()
        .single()
    }
    setGuardando(null)
    if (resultado.error) {
      alert(`No se pudo actualizar el stock: ${resultado.error.message}`)
      return
    }
    cargarStockDeSede(sedeId)
  }

  const guardarCantidad = async (sku, cantidadTexto) => {
    const cantidad = cantidadTexto === '' ? null : Number(cantidadTexto)
    if (cantidad !== null && (!Number.isInteger(cantidad) || cantidad < 0)) return
    const existente = stockPorSku.get(sku.key)
    let resultado
    if (existente) {
      resultado = await supabase.from('stock').update({ cantidad, actualizado_en: new Date().toISOString() }).eq('id', existente.id).select().single()
    } else {
      resultado = await supabase
        .from('stock')
        .insert({ sede_id: sedeId, product_id: sku.productId, product_size_id: sku.productSizeId, disponible: true, cantidad })
        .select()
        .single()
    }
    if (resultado.error) {
      alert(`No se pudo guardar la cantidad: ${resultado.error.message}`)
      return
    }
    cargarStockDeSede(sedeId)
  }

  const sedeSeleccionada = useMemo(() => sedes.find((s) => s.id === sedeId), [sedes, sedeId])

  if (error) return <p className="p-6 text-sm text-red-600">Error: {error}</p>

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Stock</h1>
        {esAdmin ? (
          <select
            value={sedeId ?? ''}
            onChange={(e) => setSedeId(e.target.value)}
            className="rounded-lg border border-borde bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-acento"
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        ) : (
          <span className="rounded-full bg-acento-suave px-3 py-1.5 text-xs font-bold text-acento-oscuro">
            {sedeSeleccionada?.nombre ?? 'Tu sede'}
          </span>
        )}
      </div>

      {!skus ? (
        <p className="text-sm text-gris">Cargando catálogo…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde/60 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borde/60 bg-hueso text-xs font-bold uppercase tracking-wide text-gris">
              <tr>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Disponible</th>
                <th className="px-4 py-3">Cantidad (opcional)</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((sku) => {
                const fila = stockPorSku.get(sku.key)
                const disponible = fila ? fila.disponible : true
                return (
                  <tr key={sku.key} className="border-b border-borde/40 last:border-0">
                    <td className="px-4 py-3 capitalize text-gris">{sku.categoria}</td>
                    <td className="px-4 py-3">{sku.nombre}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleDisponible(sku)}
                        disabled={guardando === sku.key}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                          disponible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        } disabled:opacity-50`}
                      >
                        {disponible ? 'Disponible' : 'Agotado'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        defaultValue={fila?.cantidad ?? ''}
                        placeholder="sin conteo"
                        onBlur={(e) => guardarCantidad(sku, e.target.value)}
                        className="w-28 rounded-lg border border-borde bg-white px-2 py-1.5 text-xs outline-none focus:border-acento"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
