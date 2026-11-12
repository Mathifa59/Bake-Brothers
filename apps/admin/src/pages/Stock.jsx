import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/datos'
import { Cargando, ErrorCarga, Portada, Tarjeta } from '../components/bakeos/ui'
import FotoProducto from '../components/bakeos/FotoProducto'

/**
 * Stock por sede, pensado primero para el celular: una lista de tarjetas por producto, agrupadas por categoría (la
 * categoría es el título de la sección, no se repite en cada fila). Cada producto muestra su nombre en una línea y
 * debajo sus tamaños; cada uno con un interruptor grande Disponible/Agotado y un campo chico, opcional, de cantidad.
 *
 * Criterio de la tabla `stock` (ver 0004): un producto sin tamaños es un solo SKU (product_size_id null); uno con
 * tamaños es un SKU por tamaño. Sin fila de stock = disponible. Una fila del PRODUCTO ENTERO (sin tamaño) en un
 * producto con tamaños cubre todos sus tamaños (regla única de disponibilidad, packages/domain): si existe en la sede,
 * se muestra primero, como «Todos los tamaños», para poder verla y levantarla.
 */

const TIPOS_EN_ORDEN = ['Tortas y Kekes', 'Postres', 'Postres en Caja', 'Alfajores', 'Empanadas', 'Sándwiches', 'Cajitas Dulces', 'Bebidas']
const posicionDeTipo = (t) => {
  const i = TIPOS_EN_ORDEN.indexOf(t)
  return i === -1 ? TIPOS_EN_ORDEN.length : i
}
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const NOMBRE_ENTERO = 'Todos los tamaños'

/** Productos con sus tamaños vendibles (los que tienen precio; el tamaño oculto de empanadas no cuenta). */
function armarCatalogo(productos, tamanos) {
  const porProducto = new Map()
  for (const t of tamanos) {
    if (!porProducto.has(t.product_id)) porProducto.set(t.product_id, [])
    porProducto.get(t.product_id).push(t)
  }
  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo || 'Otros',
    orden: p.orden ?? 0,
    foto_url: p.foto_url ?? null,
    tamanos: (porProducto.get(p.id) ?? []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || Number(a.precio ?? 0) - Number(b.precio ?? 0)),
  }))
}

/** El estado de un SKU según su fila de stock (sin fila = disponible). */
const estadoDe = (fila) => ({
  disponible: fila ? fila.disponible : true,
  sinUnidades: Boolean(fila && fila.disponible && fila.cantidad === 0),
})

function Interruptor({ disponible, sinUnidades, atenuado, ocupado, onClick, etiqueta }) {
  // «Sin unidades»: la fila dice Disponible pero tiene cantidad 0, y con 0 unidades NO se vende (el bot, Nuevo pedido
  // y la web lo rechazan igual que a un agotado): se muestra como no vendible, sin cambiar lo guardado.
  const estado = sinUnidades ? 'sin_unidades' : disponible ? 'disponible' : 'agotado'
  const ESTILO = {
    disponible: ['bg-green-100 text-green-800', 'bg-green-600', 'Disponible'],
    agotado: ['bg-red-100 text-red-800', 'bg-red-600', 'Agotado'],
    sin_unidades: ['bg-amber-100 text-amber-900', 'bg-amber-600', 'Sin unidades'],
  }[estado]
  return (
    <button
      type="button"
      role="switch"
      aria-checked={disponible}
      aria-label={`${etiqueta}: ${estado === 'sin_unidades' ? 'sin unidades (no se vende)' : estado}`}
      disabled={ocupado}
      onClick={onClick}
      className={`flex h-11 w-[104px] shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${ESTILO[0]} ${
        atenuado ? 'opacity-50' : ''
      }`}
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${ESTILO[1]}`} />
      <span className={estado === 'sin_unidades' ? 'text-xs leading-tight' : ''}>{ESTILO[2]}</span>
    </button>
  )
}

function FilaSku({ producto, fila, sku, bloqueado, guardando, onToggle, onCantidad }) {
  const { disponible, sinUnidades } = estadoDe(fila)
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        {sku.etiqueta && <p className={`text-sm leading-snug ${sku.entero ? 'font-bold' : 'font-medium'}`}>{sku.etiqueta}</p>}
        {sku.entero && <p className="text-[11px] leading-tight text-gris">Cubre todos los tamaños</p>}
        {bloqueado && <p className="text-[11px] font-semibold leading-tight text-red-800">Bloqueado por {NOMBRE_ENTERO}</p>}
        {sinUnidades && !bloqueado && (
          <p className="text-[11px] font-semibold leading-tight text-amber-900">Sin unidades (0): no se vende hasta poner unidades o borrar la cantidad</p>
        )}
      </div>
      <input
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        min="0"
        key={`${sku.key}:${fila?.cantidad ?? ''}`}
        defaultValue={fila?.cantidad ?? ''}
        placeholder="Cant."
        aria-label={`Cantidad de ${`${producto.nombre} ${sku.etiqueta}`.trim()} (opcional)`}
        onBlur={(e) => onCantidad(sku, e.target.value)}
        onKeyDown={(e) => {
          // «Ir» / Enter del teclado del celular: guarda y cierra el teclado (el guardado de onBlur no se repite).
          if (e.key !== 'Enter') return
          e.preventDefault()
          onCantidad(sku, e.currentTarget.value)
          e.currentTarget.blur()
        }}
        className={`h-11 w-16 shrink-0 rounded-xl border border-borde bg-hueso px-1 text-center text-sm outline-none placeholder:text-gris/60 focus:border-acento ${
          bloqueado ? 'opacity-50' : ''
        }`}
      />
      <Interruptor
        disponible={disponible}
        sinUnidades={sinUnidades}
        atenuado={bloqueado}
        ocupado={guardando === sku.key}
        onClick={() => onToggle(sku)}
        etiqueta={`${producto.nombre} ${sku.etiqueta}`.trim()}
      />
    </li>
  )
}

export default function Stock() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'

  const [sedes, setSedes] = useState([])
  const [sedeId, setSedeId] = useState(esAdmin ? null : perfil?.sedeId ?? null)
  const [catalogo, setCatalogo] = useState(null)
  const [stockPorSku, setStockPorSku] = useState(new Map()) // key -> { id, disponible, cantidad }
  const [error, setError] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  const [guardando, setGuardando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloAgotados, setSoloAgotados] = useState(false)
  // Enter y salir de la casilla disparan el guardado los dos: este registro evita escribir dos veces lo mismo.
  const cantidadGuardada = useRef(new Map()) // sede:sku -> última cantidad escrita (o null)
  const cantidadEnVuelo = useRef(new Set())

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
      traerTodo(() => supabase.from('products').select('id, nombre, tipo, orden, foto_url').eq('disponible', true).order('nombre')),
      traerTodo(() => supabase.from('product_sizes').select('id, product_id, tamano, precio, orden').eq('activo', true).not('precio', 'is', null)),
    ])
      .then(([productos, tamanos]) => setCatalogo(armarCatalogo(productos, tamanos)))
      .catch((err) => setError(err.message ?? String(err)))
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
    setErrorAccion(null)
    const existente = stockPorSku.get(sku.key)
    const nuevoValor = existente ? !existente.disponible : false // sin fila = disponible implícito; el primer toque marca agotado
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
    if (resultado.error) return setErrorAccion(`No se pudo actualizar el stock: ${resultado.error.message}`)
    cargarStockDeSede(sedeId)
  }

  const guardarCantidad = async (sku, cantidadTexto) => {
    const cantidad = cantidadTexto === '' ? null : Number(cantidadTexto)
    if (cantidad !== null && (!Number.isInteger(cantidad) || cantidad < 0)) return
    const existente = stockPorSku.get(sku.key)
    const claveSede = `${sedeId}:${sku.key}`
    const guardadaAntes = cantidadGuardada.current.has(claveSede) ? cantidadGuardada.current.get(claveSede) : (existente?.cantidad ?? null)
    if (guardadaAntes === cantidad) return // sin cambios: no se escribe
    if (!existente && cantidad === null) return
    if (cantidadEnVuelo.current.has(claveSede)) return
    cantidadEnVuelo.current.add(claveSede)
    setErrorAccion(null)
    try {
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
      if (resultado.error) return setErrorAccion(`No se pudo guardar la cantidad: ${resultado.error.message}`)
      cantidadGuardada.current.set(claveSede, cantidad)
      cargarStockDeSede(sedeId)
    } finally {
      cantidadEnVuelo.current.delete(claveSede)
    }
  }

  const sedeSeleccionada = useMemo(() => sedes.find((s) => s.id === sedeId), [sedes, sedeId])

  // Por producto: las filas (SKUs) que se muestran, con su fila de stock; y cuáles están agotadas.
  const productos = useMemo(() => {
    if (!catalogo) return null
    return catalogo.map((p) => {
      const skus = []
      if (p.tamanos.length === 0) {
        skus.push({ key: p.id, productId: p.id, productSizeId: null, etiqueta: '' }) // sin tamaños: el nombre del producto ya lo dice todo
      } else {
        if (stockPorSku.has(p.id)) skus.push({ key: p.id, productId: p.id, productSizeId: null, etiqueta: NOMBRE_ENTERO, entero: true })
        for (const t of p.tamanos) skus.push({ key: `${p.id}:${t.id}`, productId: p.id, productSizeId: t.id, etiqueta: t.tamano })
      }
      // La fila del producto entero manda sobre los tamaños (regla única de disponibilidad): si está agotada, NINGÚN
      // tamaño se vende; si está en 0 unidades, no se venden los tamaños que no tienen fila propia. Los tamaños se
      // muestran atenuados con «Bloqueado por Todos los tamaños», sin tocar lo que tienen guardado.
      const entero = p.tamanos.length > 0 ? stockPorSku.get(p.id) : undefined
      const filas = skus.map((sku) => {
        const fila = stockPorSku.get(sku.key)
        const { disponible, sinUnidades } = estadoDe(fila)
        const bloqueado = Boolean(entero && !sku.entero && (entero.disponible === false || (entero.cantidad === 0 && !fila)))
        return { sku, fila, bloqueado, agotado: !disponible || sinUnidades }
      })
      return { ...p, filas }
    })
  }, [catalogo, stockPorSku])

  const totalAgotados = useMemo(() => (productos ?? []).reduce((n, p) => n + p.filas.filter((f) => f.agotado).length, 0), [productos])

  // Aplica buscador y «Solo agotados», y agrupa por categoría en el orden del negocio.
  const secciones = useMemo(() => {
    if (!productos) return null
    const q = sinTildes(busqueda).trim()
    const grupos = new Map()
    for (const p of productos) {
      if (q) {
        const texto = sinTildes(`${p.nombre} ${p.tipo} ${p.tamanos.map((t) => t.tamano).join(' ')}`)
        if (!q.split(/\s+/).every((palabra) => texto.includes(palabra))) continue
      }
      const filas = soloAgotados ? p.filas.filter((f) => f.agotado) : p.filas
      if (filas.length === 0) continue
      if (!grupos.has(p.tipo)) grupos.set(p.tipo, [])
      grupos.get(p.tipo).push({ ...p, filas })
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => posicionDeTipo(a) - posicionDeTipo(b) || a.localeCompare(b, 'es'))
      .map(([tipo, lista]) => ({ tipo, productos: lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')) }))
  }, [productos, busqueda, soloAgotados])

  if (error) return <ErrorCarga mensaje={`Error: ${error}`} />

  const hayEnteroAgotado = (productos ?? []).some((p) => p.filas.some((f) => f.sku.entero && f.agotado))
  const totalVisibles = (secciones ?? []).reduce((n, s) => n + s.productos.length, 0)

  return (
    <>
      <Portada titulo="Stock" subtitulo="Disponibilidad de productos por sede" />
      <div className="space-y-3 py-4 pb-10">
        {esAdmin ? (
          <select
            value={sedeId ?? ''}
            onChange={(e) => setSedeId(e.target.value)}
            aria-label="Local"
            className="h-11 w-full rounded-xl border border-borde bg-hueso px-3 text-base font-semibold outline-none focus:border-acento"
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-block rounded-full bg-acento-suave px-3 py-1.5 text-xs font-bold text-acento-oscuro">
            {sedeSeleccionada?.nombre ?? 'Tu sede'}
          </span>
        )}

        <label className="flex h-11 items-center gap-2 rounded-xl border border-borde bg-hueso px-3">
          <Search size={16} className="shrink-0 text-gris" aria-hidden="true" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o tamaño"
            aria-label="Buscar producto o tamaño"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-gris/70"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-pressed={soloAgotados}
            onClick={() => setSoloAgotados((v) => !v)}
            className={`h-11 rounded-full px-4 text-sm font-semibold transition-colors ${
              soloAgotados ? 'bg-red-100 text-red-800' : 'bg-borde/60 text-gris'
            }`}
          >
            Solo agotados{totalAgotados > 0 ? ` (${totalAgotados})` : ''}
          </button>
          {productos && (
            <p className="text-xs text-gris" aria-live="polite">
              {totalVisibles} producto{totalVisibles === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {hayEnteroAgotado && (
          <p role="note" className="rounded-xl bg-acento-suave p-3 text-sm text-acento-oscuro">
            Hay productos <b>agotados en todos sus tamaños</b> (filas «{NOMBRE_ENTERO}»). Mientras estén agotados no se vende ningún tamaño en esta sede.
            Toca «Agotado» para levantarlos.
          </p>
        )}
        {errorAccion && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {errorAccion}
          </p>
        )}

        {!secciones ? (
          <Cargando texto="Cargando catálogo…" />
        ) : secciones.length === 0 ? (
          <Tarjeta className="text-center text-sm text-gris">
            {soloAgotados && !busqueda ? 'No hay nada agotado en esta sede.' : 'Ningún producto coincide con lo que buscas.'}
          </Tarjeta>
        ) : (
          secciones.map((s) => (
            <section key={s.tipo} aria-label={s.tipo} className="pt-2">
              <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-gris">{s.tipo}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {s.productos.map((p) => (
                  <Tarjeta key={p.id} className="p-3">
                    <div className="flex items-center gap-2.5">
                      <FotoProducto url={p.foto_url} nombre={p.nombre} className="h-11 w-11" />
                      <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{p.nombre}</h3>
                    </div>
                    <ul className="mt-1 divide-y divide-borde/60">
                      {p.filas.map(({ sku, fila, bloqueado }) => (
                        <FilaSku key={sku.key} producto={p} fila={fila} sku={sku} bloqueado={bloqueado} guardando={guardando} onToggle={toggleDisponible} onCantidad={guardarCantidad} />
                      ))}
                    </ul>
                  </Tarjeta>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  )
}
