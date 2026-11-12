import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Search } from 'lucide-react'
import { catalogoApi } from '../lib/catalogoApi'
import { Cargando, ErrorCarga, Portada } from '../components/bakeos/ui'
import FotoProducto from '../components/bakeos/FotoProducto'
import EditorProducto, { Interruptor } from '../components/catalogo/EditorProducto'
import { formatoPrecio } from '../utils/formato'

const TIPOS_EN_ORDEN = ['Tortas y Kekes', 'Postres', 'Postres en Caja', 'Alfajores', 'Empanadas', 'Sándwiches', 'Cajitas Dulces', 'Bebidas']
const posicionDeTipo = (t) => {
  const i = TIPOS_EN_ORDEN.indexOf(t)
  return i === -1 ? TIPOS_EN_ORDEN.length : i
}
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const AREA_TEXTO = { pasteleria: 'Pastelería', empanaderia: 'Empanadería', cocina: 'Cocina', empaque: 'Empaque' }

const PESTANAS = [
  ['productos', 'Productos'],
  ['combos', 'Combos'],
  ['catering', 'Catering'],
]

/** «desde S/ 8.90» o «S/ 8.90» según haya varias opciones activas. */
function precioDe(p) {
  const activos = (p.product_sizes ?? []).filter((t) => t.activo && t.precio !== null)
  if (activos.length === 0) return formatoPrecio(p.precio_base)
  const min = Math.min(...activos.map((t) => Number(t.precio)))
  return activos.length > 1 ? `desde ${formatoPrecio(min)}` : formatoPrecio(min)
}

function FilaProducto({ p, puedeSubir, puedeBajar, ocupado, onAbrir, onActivo, onMover }) {
  const opciones = (p.product_sizes ?? []).filter((t) => t.activo)
  const sabores = p.product_sizes?.[0]?.clase === 'sabor'
  return (
    <li className={`flex items-center gap-2.5 rounded-2xl border border-borde bg-hueso p-2.5 ${p.disponible ? '' : 'opacity-70'}`}>
      <button type="button" onClick={() => onAbrir(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Editar ${p.nombre}`}>
        <FotoProducto url={p.foto_url} nombre={p.nombre} className="h-14 w-14" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight">{p.nombre}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-gris">
            {precioDe(p)}
            {opciones.length > 1 ? ` · ${opciones.length} ${sabores ? 'sabores' : 'tamaños'}` : ''}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {!p.disponible && <span className="rounded-md bg-borde px-1.5 py-0.5 text-[11px] font-bold text-gris">Oculto</span>}
            {p.area_produccion && <span className="rounded-md bg-lila-suave px-1.5 py-0.5 text-[11px] font-semibold">{AREA_TEXTO[p.area_produccion]}</span>}
            {!p.foto_url && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Sin foto</span>}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <Interruptor activo={p.disponible} disabled={ocupado} onClick={() => onActivo(p)} etiqueta={`${p.nombre} activo`} />
        <div className="flex gap-1">
          <button type="button" aria-label="Subir de lugar" disabled={!puedeSubir || ocupado} onClick={() => onMover(p, -1)} className="grid h-9 w-11 place-items-center rounded-lg border border-borde text-gris disabled:opacity-30"><ArrowUp size={15} aria-hidden="true" /></button>
          <button type="button" aria-label="Bajar de lugar" disabled={!puedeBajar || ocupado} onClick={() => onMover(p, 1)} className="grid h-9 w-11 place-items-center rounded-lg border border-borde text-gris disabled:opacity-30"><ArrowDown size={15} aria-hidden="true" /></button>
        </div>
      </div>
    </li>
  )
}

/** Combos y catering: activo/oculto, precio (solo combos) y foto (una). */
function ListaSimple({ filas, tabla, api, onCambio, onError }) {
  const [ocupado, setOcupado] = useState(null)
  const archivo = useRef(null)
  const [paraFoto, setParaFoto] = useState(null)

  const ejecutar = async (id, fn) => {
    setOcupado(id)
    onError(null)
    try {
      await fn()
      await onCambio()
    } catch (e) {
      onError(e.message)
    } finally {
      setOcupado(null)
    }
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {filas.map((f) => (
          <li key={f.id} className={`flex flex-col gap-2 rounded-2xl border border-borde bg-hueso p-2.5 ${f.activo ? '' : 'opacity-70'}`}>
            <div className="flex items-center gap-3">
              <FotoProducto url={f.foto_url} nombre={f.nombre} className="h-14 w-14" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight">{f.nombre}</span>
                {tabla === 'combos' && <span className="block text-[13px] text-gris">{formatoPrecio(f.precio_promo)}</span>}
                {tabla === 'catering_items' && <span className="block text-[13px] text-gris">Se cotiza a mano</span>}
              </span>
              <Interruptor
                activo={f.activo}
                disabled={ocupado === f.id}
                etiqueta={`${f.nombre} activo`}
                onClick={() =>
                  ejecutar(f.id, () => (tabla === 'combos' ? api.guardarCombo({ ...f, activo: !f.activo }) : api.cambiarActivoCatering(f.id, !f.activo)))
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tabla === 'combos' && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gris">Precio S/</span>
                  <input
                    key={`${f.id}-${f.precio_promo}`}
                    defaultValue={Number(f.precio_promo).toFixed(2)}
                    inputMode="decimal"
                    aria-label={`Precio de ${f.nombre}`}
                    className="min-h-11 w-24 rounded-xl border border-borde bg-white px-3 text-[15px] outline-none focus:border-acento"
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v) && v > 0 && v !== Number(f.precio_promo)) ejecutar(f.id, () => api.guardarCombo({ ...f, precio_promo: v }))
                    }}
                  />
                </label>
              )}
              <span className="flex-1" />
              <button type="button" disabled={ocupado === f.id} onClick={() => { setParaFoto(f); archivo.current?.click() }} className="min-h-11 rounded-xl border border-borde bg-white px-3 text-sm font-semibold disabled:opacity-50">
                {f.foto_url ? 'Cambiar foto' : 'Agregar foto'}
              </button>
              {f.foto_url && (
                <button type="button" disabled={ocupado === f.id} onClick={() => ejecutar(f.id, () => api.quitarFotoUnica(tabla, f))} className="min-h-11 rounded-xl border border-borde bg-white px-3 text-sm font-semibold text-red-700 disabled:opacity-50">
                  Quitar foto
                </button>
              )}
            </div>
          </li>
        ))}
        {filas.length === 0 && <p className="rounded-2xl border border-borde bg-hueso p-6 text-center text-sm text-gris">No hay nada que mostrar.</p>}
      </ul>
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Elegir foto"
        onChange={(e) => {
          const a = e.target.files?.[0]
          e.target.value = ''
          if (a && paraFoto) ejecutar(paraFoto.id, () => api.cambiarFotoUnica(tabla, paraFoto, a))
        }}
      />
    </>
  )
}

/**
 * Catálogo (solo Administración): crear, editar y duplicar productos con sus tamaños o sabores, activarlos u ocultarlos,
 * ordenarlos dentro de su familia y manejar sus fotos; y activar/ocultar combos y catering con precio y foto.
 * `api` se puede reemplazar para probar la pantalla con datos de ejemplo.
 */
export default function Catalogo({ api = catalogoApi }) {
  const [pestana, setPestana] = useState('productos')
  const [productos, setProductos] = useState(null)
  const [combos, setCombos] = useState(null)
  const [catering, setCatering] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [verOcultos, setVerOcultos] = useState(false)
  const [editandoId, setEditandoId] = useState(undefined) // undefined = cerrado, null = nuevo, string = id
  const [familiaNuevo, setFamiliaNuevo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)
  const [fotosOcupado, setFotosOcupado] = useState(false)
  const [errorFotos, setErrorFotos] = useState(null)
  const [ocupadoId, setOcupadoId] = useState(null)

  const recargar = useCallback(async () => {
    try {
      setError(null)
      const [p, c, k] = await Promise.all([api.cargarProductos(), api.cargarCombos(), api.cargarCatering()])
      setProductos(p)
      setCombos(c)
      setCatering(k)
    } catch (e) {
      setError(e.message)
    }
  }, [api])
  useEffect(() => {
    recargar()
  }, [recargar])

  const familias = useMemo(() => {
    const set = [...new Set((productos ?? []).map((p) => p.tipo))]
    return set.sort((a, b) => posicionDeTipo(a) - posicionDeTipo(b))
  }, [productos])

  const ocultos = (productos ?? []).filter((p) => !p.disponible).length
  const secciones = useMemo(() => {
    const t = sinTildes(busqueda.trim())
    const visibles = (productos ?? []).filter(
      (p) => (verOcultos || p.disponible) && (!t || sinTildes(`${p.nombre} ${p.tipo} ${p.sabor ?? ''}`).includes(t))
    )
    return familias
      .map((f) => ({ familia: f, items: visibles.filter((p) => p.tipo === f).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)) }))
      .filter((s) => s.items.length > 0)
  }, [productos, familias, busqueda, verOcultos])

  const editando = editandoId ? (productos ?? []).find((p) => p.id === editandoId) ?? null : null

  const envolver = async (fn, { id = null } = {}) => {
    setOcupadoId(id)
    setError(null)
    try {
      await fn()
      await recargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupadoId(null)
    }
  }

  const guardar = async (datos, tamanos) => {
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const id = await api.guardarProducto(datos, tamanos, productos)
      await recargar()
      setAviso(datos.id ? 'Cambios guardados.' : 'Producto creado. Ya puedes subirle fotos.')
      // Un producto recién creado se queda abierto para poder subirle fotos.
      setEditandoId(datos.id ? undefined : id)
    } catch (e) {
      setErrorGuardar(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const duplicar = async (p) => {
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const id = await api.duplicarProducto(p, productos)
      await recargar()
      setAviso('Copia creada. Está oculta hasta que la actives.')
      setEditandoId(id)
    } catch (e) {
      setErrorGuardar(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const fotos = async (fn) => {
    setFotosOcupado(true)
    setErrorFotos(null)
    try {
      await fn()
      await recargar()
    } catch (e) {
      setErrorFotos(e.message)
    } finally {
      setFotosOcupado(false)
    }
  }

  if (error && !productos) return <ErrorCarga mensaje={`No se pudo cargar el catálogo: ${error}`} />

  return (
    <>
      <Portada titulo="Catálogo" subtitulo="Productos, combos y catering: precios, fotos y qué se ofrece" accion={false} />

      <div role="tablist" aria-label="Qué catálogo" className="mt-4 flex gap-1.5">
        {PESTANAS.map(([v, t]) => (
          <button key={v} role="tab" aria-selected={pestana === v} onClick={() => setPestana(v)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${pestana === v ? 'bg-tinta text-white' : 'border border-borde bg-hueso'}`}>
            {t}
          </button>
        ))}
      </div>

      {aviso && (
        <p role="status" className="mt-3 rounded-xl bg-ok-suave px-3.5 py-2.5 text-sm text-ok" onClick={() => setAviso(null)}>
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {!productos ? (
        <Cargando texto="Cargando el catálogo…" />
      ) : pestana === 'productos' ? (
        <div className="mt-4 flex flex-col gap-3 pb-6">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Buscar producto</span>
              <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto" className="min-h-11 w-full rounded-xl border border-borde bg-hueso pl-9 pr-3 text-sm outline-none focus:border-acento" />
            </label>
            <button
              type="button"
              onClick={() => {
                setErrorGuardar(null)
                setFamiliaNuevo(secciones[0]?.familia ?? familias[0])
                setEditandoId(null)
              }}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-tinta px-4 text-sm font-semibold text-white"
            >
              <Plus size={16} aria-hidden="true" /> Nuevo
            </button>
          </div>
          <button
            type="button"
            aria-pressed={verOcultos}
            onClick={() => setVerOcultos((v) => !v)}
            className={`min-h-11 self-start rounded-full px-4 text-sm font-semibold ${verOcultos ? 'bg-tinta text-white' : 'border border-borde bg-hueso'}`}
          >
            Ver ocultos ({ocultos})
          </button>

          {secciones.length === 0 && <p className="rounded-2xl border border-borde bg-hueso p-6 text-center text-sm text-gris">{busqueda ? 'Nada coincide con la búsqueda.' : 'No hay productos que mostrar.'}</p>}
          {secciones.map((s) => (
            <section key={s.familia} aria-label={s.familia} className="flex flex-col gap-2">
              <h2 className="mt-2 text-xs font-bold uppercase tracking-wide text-gris">{s.familia}</h2>
              <ul className="flex flex-col gap-2">
                {s.items.map((p, i) => (
                  <FilaProducto
                    key={p.id}
                    p={p}
                    puedeSubir={i > 0}
                    puedeBajar={i < s.items.length - 1}
                    ocupado={ocupadoId === p.id}
                    onAbrir={(x) => {
                      setErrorGuardar(null)
                      setErrorFotos(null)
                      setEditandoId(x.id)
                    }}
                    onActivo={(x) => envolver(() => api.cambiarActivo(x.id, !x.disponible), { id: x.id })}
                    onMover={(x, delta) => envolver(() => api.intercambiarOrden(x, s.items[i + delta]), { id: x.id })}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : pestana === 'combos' ? (
        <div className="mt-4 pb-6">
          <ListaSimple filas={combos ?? []} tabla="combos" api={api} onCambio={recargar} onError={setError} />
        </div>
      ) : (
        <div className="mt-4 pb-6">
          <ListaSimple filas={catering ?? []} tabla="catering_items" api={api} onCambio={recargar} onError={setError} />
        </div>
      )}

      {editandoId !== undefined && (editandoId === null || editando) && (
        <EditorProducto
          key={editandoId ?? 'nuevo'}
          producto={editando}
          familias={familias}
          familiaInicial={familiaNuevo}
          valoresFamiliaOperativa={(productos ?? []).map((p) => p.familia_operativa).filter(Boolean)}
          guardando={guardando}
          errorGuardar={errorGuardar}
          fotosOcupado={fotosOcupado}
          errorFotos={errorFotos}
          onGuardar={guardar}
          onDuplicar={duplicar}
          onCerrar={() => setEditandoId(undefined)}
          onAgregarFotos={(archivos) =>
            fotos(async () => {
              let cantidad = editando.product_photos.length
              for (const a of archivos) {
                await api.agregarFotoProducto(editando.id, a, cantidad)
                cantidad += 1
              }
            })
          }
          onPrincipal={(f) => fotos(() => api.hacerPrincipal(f, editando.product_photos))}
          onQuitarFoto={(f) => fotos(() => api.quitarFotoProducto(f))}
        />
      )}
    </>
  )
}
