import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { crearPedidoDashboard, obtenerComprobantePdfUrl } from '../lib/apiClient'

// Placeholder simple para productos sin foto_url — a propósito no es la
// versión con gradiente de apps/web (ProductImage.jsx): es una herramienta
// interna, no la vitrina de cara al cliente.
function FotoProducto({ url, nombre }) {
  if (url) {
    return <img src={url} alt={nombre} className="h-10 w-10 rounded-lg object-cover" />
  }
  return (
    <div className="grid h-10 w-10 place-items-center rounded-lg bg-hueso text-gris" aria-hidden="true">
      🥐
    </div>
  )
}

const METODOS_PAGO = ['yape', 'plin', 'transferencia', 'tarjeta', 'contraentrega']

export default function NuevoPedido() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'

  // ————————————————————————————————————————— catálogo (una sola carga) ————
  const [productos, setProductos] = useState(null)
  const [tamanos, setTamanos] = useState([])
  const [combos, setCombos] = useState(null)
  const [cateringItems, setCateringItems] = useState(null)
  const [sedes, setSedes] = useState([])
  const [errorCarga, setErrorCarga] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id, slug, nombre, precio_base, foto_url').eq('disponible', true).order('nombre'),
      supabase.from('product_sizes').select('id, product_id, tamano, precio').not('precio', 'is', null),
      supabase
        .from('combos')
        .select('id, nombre, precio_promo, canal_permitido')
        .eq('activo', true)
        // Un combo exclusivo de WhatsApp no se puede vender desde acá — se
        // filtra en la búsqueda para no ofrecer algo que el servidor va a
        // rechazar de todas formas (la validación real sigue siendo la del
        // servidor, esto es solo para no confundir al operador).
        .in('canal_permitido', ['presencial', 'ambos'])
        .order('nombre'),
      supabase.from('catering_items').select('id, nombre, categoria').eq('activo', true).order('nombre'),
      supabase.from('sedes').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([p, ps, c, ci, s]) => {
      const error = p.error || ps.error || c.error || ci.error || s.error
      if (error) return setErrorCarga(error.message)
      setProductos(p.data)
      setTamanos(ps.data)
      setCombos(c.data)
      setCateringItems(ci.data)
      setSedes(s.data)
    })
  }, [])

  const tamanosPorProducto = useMemo(() => {
    const mapa = new Map()
    for (const t of tamanos) {
      if (!mapa.has(t.product_id)) mapa.set(t.product_id, [])
      mapa.get(t.product_id).push(t)
    }
    return mapa
  }, [tamanos])

  // ————————————————————————————————————————————————————————— cliente ————
  const [modoCliente, setModoCliente] = useState('buscar') // 'buscar' | 'nuevo'
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [clienteNuevoNombre, setClienteNuevoNombre] = useState('')
  const [clienteNuevoTelefono, setClienteNuevoTelefono] = useState('')

  useEffect(() => {
    if (modoCliente !== 'buscar' || busquedaCliente.trim().length < 2) {
      setResultadosCliente([])
      return
    }
    const texto = `%${busquedaCliente.trim()}%`
    const t = setTimeout(() => {
      supabase
        .from('customers')
        .select('id, nombre, telefono')
        .or(`nombre.ilike.${texto},telefono.ilike.${texto}`)
        .limit(8)
        .then(({ data, error }) => {
          if (!error) setResultadosCliente(data)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [busquedaCliente, modoCliente])

  // —————————————————————————————————————————————————————————————— items ————
  const [items, setItems] = useState([]) // { key, tipo, nombre, cantidad, ...datos específicos }
  const [tipoNuevoItem, setTipoNuevoItem] = useState('producto')
  const [busquedaItem, setBusquedaItem] = useState('')
  const [productoParaAgregar, setProductoParaAgregar] = useState(null)
  const [tamanoParaAgregar, setTamanoParaAgregar] = useState('')
  const [cantidadParaAgregar, setCantidadParaAgregar] = useState(1)

  const opcionesBusqueda = useMemo(() => {
    const texto = busquedaItem.trim().toLowerCase()
    if (texto.length < 1) return []
    if (tipoNuevoItem === 'producto') {
      return (productos ?? []).filter((p) => p.nombre.toLowerCase().includes(texto)).slice(0, 8)
    }
    if (tipoNuevoItem === 'combo') {
      return (combos ?? []).filter((c) => c.nombre.toLowerCase().includes(texto)).slice(0, 8)
    }
    return (cateringItems ?? []).filter((c) => c.nombre.toLowerCase().includes(texto)).slice(0, 8)
  }, [busquedaItem, tipoNuevoItem, productos, combos, cateringItems])

  const agregarItem = () => {
    const cantidad = Number(cantidadParaAgregar)
    if (!cantidad || cantidad < 1) return

    if (tipoNuevoItem === 'producto') {
      if (!productoParaAgregar) return
      const suyos = tamanosPorProducto.get(productoParaAgregar.id) ?? []
      if (suyos.length > 0 && !tamanoParaAgregar) return // hace falta elegir tamaño
      setItems((prev) => [
        ...prev,
        {
          key: `${Date.now()}`,
          tipo: 'producto',
          productoId: productoParaAgregar.slug,
          tamano: tamanoParaAgregar || null,
          cantidad,
          nombre: productoParaAgregar.nombre + (tamanoParaAgregar ? ` (${tamanoParaAgregar})` : ''),
        },
      ])
    } else if (tipoNuevoItem === 'combo') {
      if (!productoParaAgregar) return
      setItems((prev) => [
        ...prev,
        { key: `${Date.now()}`, tipo: 'combo', comboId: productoParaAgregar.id, cantidad, nombre: productoParaAgregar.nombre },
      ])
    } else {
      const item = productoParaAgregar
      if (!item) return
      setItems((prev) => [
        ...prev,
        { key: `${Date.now()}`, tipo: 'catering', busquedaItem: item.nombre, cantidad, nombre: item.nombre },
      ])
    }

    setBusquedaItem('')
    setProductoParaAgregar(null)
    setTamanoParaAgregar('')
    setCantidadParaAgregar(1)
  }

  const quitarItem = (key) => setItems((prev) => prev.filter((i) => i.key !== key))

  // ——————————————————————————————————————————————————————————— entrega ————
  const [tipoEntrega, setTipoEntrega] = useState('tienda')
  const [direccion, setDireccion] = useState('')
  const [distrito, setDistrito] = useState('')
  const [referencia, setReferencia] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [horario, setHorario] = useState('')
  const [metodoPago, setMetodoPago] = useState('yape')
  const [yaPago, setYaPago] = useState(false)
  const [nota, setNota] = useState('')
  const [sedeId, setSedeId] = useState(esAdmin ? '' : perfil?.sedeId ?? '')

  // ————————————————————————————————————————————————————————— envío ————
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [cargandoPdf, setCargandoPdf] = useState(false)

  const puedeEnviar =
    items.length > 0 &&
    fechaEntrega &&
    horario.trim() &&
    (clienteSeleccionado || (clienteNuevoNombre.trim() && clienteNuevoTelefono.trim())) &&
    (tipoEntrega === 'tienda' || (direccion.trim() && distrito.trim()))

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const cliente = clienteSeleccionado
        ? { nombre: clienteSeleccionado.nombre, telefono: clienteSeleccionado.telefono }
        : { nombre: clienteNuevoNombre.trim(), telefono: clienteNuevoTelefono.trim() }

      const payload = {
        cliente,
        tipoEntrega,
        direccion: tipoEntrega === 'delivery' ? direccion : null,
        distrito: tipoEntrega === 'delivery' ? distrito : null,
        referencia: referencia || null,
        fechaEntrega,
        horario,
        items: items.map((i) =>
          i.tipo === 'producto'
            ? { tipo: 'producto', productoId: i.productoId, tamano: i.tamano, cantidad: i.cantidad }
            : i.tipo === 'combo'
              ? { tipo: 'combo', comboId: i.comboId, cantidad: i.cantidad }
              : { tipo: 'catering', busquedaItem: i.busquedaItem, cantidad: i.cantidad }
        ),
        metodoPago,
        yaPago,
        nota: nota || null,
        ...(esAdmin ? { sedeId: sedeId || null } : {}),
      }

      const data = await crearPedidoDashboard(payload)
      setResultado(data)
      setItems([])
    } catch (e) {
      setError(e)
    } finally {
      setEnviando(false)
    }
  }

  const verComprobante = async () => {
    if (!resultado) return
    setCargandoPdf(true)
    try {
      const url = await obtenerComprobantePdfUrl(resultado.numero)
      setPdfUrl(url)
      window.open(url, '_blank')
    } catch (e) {
      alert(e.message)
    } finally {
      setCargandoPdf(false)
    }
  }

  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl])

  if (errorCarga) return <p className="p-6 text-sm text-red-600">Error al cargar el catálogo: {errorCarga}</p>

  if (resultado) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-2xl border border-borde/60 bg-white p-6 text-center">
          <p className="text-3xl">🎉</p>
          <p className="mt-2 text-lg font-bold">Pedido {resultado.numero} registrado</p>
          <p className="mt-1 text-sm text-gris">
            Estado: {resultado.estado === 'paid' ? 'Pagado' : 'Confirmado'} — Total S/ {Number(resultado.total).toFixed(2)}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={verComprobante}
              disabled={cargandoPdf}
              className="rounded-full bg-tinta px-5 py-2.5 text-sm font-bold text-white hover:bg-black disabled:opacity-50"
            >
              {cargandoPdf ? 'Generando…' : 'Ver comprobante (PDF)'}
            </button>
            <button
              onClick={() => setResultado(null)}
              className="rounded-full border border-borde px-5 py-2.5 text-sm font-bold hover:bg-hueso"
            >
              Registrar otro pedido
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-bold">Nuevo pedido</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudo registrar el pedido: {error.message}
          {error.detalle ? <span className="block text-xs opacity-80">{JSON.stringify(error.detalle)}</span> : null}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ——————————————————————————————————————————————————— Cliente ———— */}
        <section className="rounded-2xl border border-borde/60 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-gris">Cliente</h2>
          <div className="mb-3 flex gap-2 text-xs font-semibold">
            <button
              onClick={() => setModoCliente('buscar')}
              className={`rounded-full px-3 py-1.5 ${modoCliente === 'buscar' ? 'bg-tinta text-white' : 'bg-hueso'}`}
            >
              Buscar existente
            </button>
            <button
              onClick={() => {
                setModoCliente('nuevo')
                setClienteSeleccionado(null)
              }}
              className={`rounded-full px-3 py-1.5 ${modoCliente === 'nuevo' ? 'bg-tinta text-white' : 'bg-hueso'}`}
            >
              Cliente nuevo
            </button>
          </div>

          {modoCliente === 'buscar' ? (
            <>
              <input
                value={busquedaCliente}
                onChange={(e) => {
                  setBusquedaCliente(e.target.value)
                  setClienteSeleccionado(null)
                }}
                placeholder="Nombre o teléfono…"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
              {clienteSeleccionado ? (
                <p className="mt-2 rounded-lg bg-acento-suave px-3 py-2 text-sm font-semibold">
                  {clienteSeleccionado.nombre} — {clienteSeleccionado.telefono}
                </p>
              ) : (
                resultadosCliente.length > 0 && (
                  <ul className="mt-2 divide-y divide-borde/40 rounded-lg border border-borde/60">
                    {resultadosCliente.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setClienteSeleccionado(c)
                          setBusquedaCliente(`${c.nombre} — ${c.telefono}`)
                          setResultadosCliente([])
                        }}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-hueso"
                      >
                        {c.nombre} — {c.telefono}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </>
          ) : (
            <div className="space-y-2">
              <input
                value={clienteNuevoNombre}
                onChange={(e) => setClienteNuevoNombre(e.target.value)}
                placeholder="Nombre completo"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
              <input
                value={clienteNuevoTelefono}
                onChange={(e) => setClienteNuevoTelefono(e.target.value)}
                placeholder="Teléfono"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
            </div>
          )}
        </section>

        {/* ————————————————————————————————————————————————————— Entrega ———— */}
        <section className="rounded-2xl border border-borde/60 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-gris">Entrega</h2>
          <div className="mb-3 flex gap-2 text-xs font-semibold">
            <button
              onClick={() => setTipoEntrega('tienda')}
              className={`rounded-full px-3 py-1.5 ${tipoEntrega === 'tienda' ? 'bg-tinta text-white' : 'bg-hueso'}`}
            >
              Recojo en tienda
            </button>
            <button
              onClick={() => setTipoEntrega('delivery')}
              className={`rounded-full px-3 py-1.5 ${tipoEntrega === 'delivery' ? 'bg-tinta text-white' : 'bg-hueso'}`}
            >
              Delivery
            </button>
          </div>
          {tipoEntrega === 'delivery' && (
            <div className="mb-3 space-y-2">
              <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Dirección"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
              <input
                value={distrito}
                onChange={(e) => setDistrito(e.target.value)}
                placeholder="Distrito"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
              <input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Referencia (opcional)"
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
              <p className="text-xs text-gris">El costo del delivery lo cotiza el equipo por separado.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
            />
            <input
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              placeholder="Horario (ej. 4pm)"
              className="rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
            />
          </div>

          {esAdmin && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-bold text-gris">Sede</label>
              <select
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                className="w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
              >
                <option value="">Sin asignar</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* ——————————————————————————————————————————————————————— Items ———— */}
        <section className="rounded-2xl border border-borde/60 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold text-gris">Productos, combos y catering</h2>

          <div className="mb-3 flex gap-2 text-xs font-semibold">
            {['producto', 'combo', 'catering'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTipoNuevoItem(t)
                  setBusquedaItem('')
                  setProductoParaAgregar(null)
                  setTamanoParaAgregar('')
                }}
                className={`rounded-full px-3 py-1.5 capitalize ${tipoNuevoItem === t ? 'bg-tinta text-white' : 'bg-hueso'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <input
                value={busquedaItem}
                onChange={(e) => {
                  setBusquedaItem(e.target.value)
                  setProductoParaAgregar(null)
                }}
                placeholder={`Buscar ${tipoNuevoItem}…`}
                className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
              />
              {!productoParaAgregar && opcionesBusqueda.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full divide-y divide-borde/40 rounded-lg border border-borde/60 bg-white shadow-lg">
                  {opcionesBusqueda.map((o) => (
                    <li
                      key={o.id}
                      onClick={() => {
                        setProductoParaAgregar(o)
                        setBusquedaItem(o.nombre)
                        setTamanoParaAgregar('')
                      }}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-hueso"
                    >
                      {tipoNuevoItem === 'producto' && <FotoProducto url={o.foto_url} nombre={o.nombre} />}
                      <span>
                        {o.nombre}
                        {tipoNuevoItem === 'combo' ? ` — S/ ${Number(o.precio_promo).toFixed(2)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {tipoNuevoItem === 'producto' &&
              productoParaAgregar &&
              (tamanosPorProducto.get(productoParaAgregar.id) ?? []).length > 0 && (
                <select
                  value={tamanoParaAgregar}
                  onChange={(e) => setTamanoParaAgregar(e.target.value)}
                  className="rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
                >
                  <option value="">Tamaño…</option>
                  {tamanosPorProducto.get(productoParaAgregar.id).map((t) => (
                    <option key={t.id} value={t.tamano}>
                      {t.tamano} — S/ {Number(t.precio).toFixed(2)}
                    </option>
                  ))}
                </select>
              )}

            <input
              type="number"
              min="1"
              value={cantidadParaAgregar}
              onChange={(e) => setCantidadParaAgregar(e.target.value)}
              className="w-20 rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
            />

            <button
              onClick={agregarItem}
              disabled={!productoParaAgregar}
              className="rounded-full bg-tinta px-4 py-2 text-sm font-bold text-white hover:bg-black disabled:opacity-40"
            >
              Agregar
            </button>
          </div>

          {items.length > 0 && (
            <ul className="mt-4 divide-y divide-borde/40 rounded-lg border border-borde/60">
              {items.map((i) => (
                <li key={i.key} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {i.cantidad}× {i.nombre}{' '}
                    <span className="text-xs uppercase text-gris">({i.tipo})</span>
                  </span>
                  <button onClick={() => quitarItem(i.key)} className="text-xs font-semibold text-red-600 hover:underline">
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ————————————————————————————————————————————————————————— Pago ———— */}
        <section className="rounded-2xl border border-borde/60 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold text-gris">Pago y notas</h2>
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              className="rounded-lg border border-borde bg-white px-3 py-2 text-sm capitalize outline-none focus:border-acento"
            >
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={yaPago} onChange={(e) => setYaPago(e.target.checked)} />
              ¿Ya pagó?
            </label>
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Preferencias del cliente (ej. jugo sin azúcar, empanadas calientes) u otras notas…"
            rows={2}
            className="mt-3 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
          />
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={enviar}
          disabled={!puedeEnviar || enviando}
          className="rounded-full bg-tinta px-6 py-3 text-sm font-bold text-white hover:bg-black disabled:opacity-40"
        >
          {enviando ? 'Registrando…' : 'Registrar pedido'}
        </button>
      </div>
    </div>
  )
}
